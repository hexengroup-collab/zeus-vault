import fs from 'node:fs'
import path from 'node:path'
import type { Db } from '../db/sqlite'
import { AppError, assertFound } from '../lib/errors'
import { presetDir, ensureWritableDir } from '../lib/vision'
import type { AuditService, Actor } from './audit'
import type { SettingsService } from './settings'
import type { BackupEntry } from '../../shared/types'

export class BackupService {
  constructor(
    private db: Db,
    private audit: AuditService,
    private settings: SettingsService,
    private backupsDir: string,
    private createSnapshot: () => Buffer,
  ) {}

  create(mode: 'encrypted' | 'plain', label: string | undefined, actor: Actor): BackupEntry {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safeLabel = (label ?? (mode === 'encrypted' ? 'Encrypted backup' : 'Plain backup')).trim().slice(0, 80) || 'Backup'
    const id = crypto.randomUUID()
    const s = this.settings.get()
    const dir = s.backupFolderPreset && s.backupFolderPreset !== 'vault' && s.backupFolderPreset !== 'custom' ? ensureWritableDir(presetDir(s.backupFolderPreset, this.backupsDir, this.backupsDir, 'backups')) : this.backupsDir
    let filePath: string
    if (mode === 'encrypted') {
      filePath = path.join(dir, `zeus-vault-${stamp}.zvbak`)
      fs.writeFileSync(filePath, this.createSnapshot())
    } else {
      filePath = path.join(dir, `zeus-vault-${stamp}.db`)
      const tmp = `${filePath}.tmp`
      this.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`)
      fs.renameSync(tmp, filePath)
    }
    const size = fs.statSync(filePath).size
    const now = new Date().toISOString()
    this.db.run('INSERT INTO database_backups(id, label, mode, path, size, fingerprint, created_by, created_at, status) VALUES (?,?,?,?,?,?,?,?,?)', [
      id, safeLabel, mode, filePath, size, null, actor.username, now, 'complete',
    ])
    this.prune(actor)
    this.audit.record(actor, { eventType: 'BACKUP_CREATED', targetType: 'system', detail: `${mode === 'encrypted' ? 'Encrypted' : 'Plain'} backup created: ${path.basename(filePath)}` })
    return { id, label: safeLabel, mode, path: filePath, size, createdAt: now, createdBy: actor.username, status: 'complete' }
  }

  private prune(actor: Actor): void {
    const retention = this.settings.get().backupRetention
    const rows = this.db.all<{ id: string; path: string }>('SELECT id, path FROM database_backups ORDER BY created_at DESC', [])
    const stale = rows.slice(retention)
    for (const row of stale) {
      try {
        fs.rmSync(row.path, { force: true })
      } catch {
        /* keep going */
      }
      this.db.run('DELETE FROM database_backups WHERE id = ?', [row.id])
    }
    if (stale.length) {
      this.audit.record(actor, { eventType: 'SETTINGS_UPDATED', targetType: 'system', detail: `Pruned ${stale.length} old backup(s); retention ${retention}` })
    }
  }

  list(): BackupEntry[] {
    return this.db.all<Record<string, unknown>>('SELECT * FROM database_backups ORDER BY created_at DESC').map((r) => ({
      id: String(r.id),
      label: String(r.label),
      mode: r.mode as BackupEntry['mode'],
      path: String(r.path),
      size: Number(r.size),
      createdAt: String(r.created_at),
      createdBy: String(r.created_by ?? ''),
      status: String(r.status),
    }))
  }

  delete(id: string, actor: Actor): void {
    const row = assertFound(this.db.get<{ id: string; path: string; label: string }>('SELECT id, path, label FROM database_backups WHERE id = ?', [id]), 'Backup')
    try {
      fs.rmSync(row.path, { force: true })
    } catch {
      /* file may be gone */
    }
    this.db.run('DELETE FROM database_backups WHERE id = ?', [id])
    this.audit.record(actor, { eventType: 'SETTINGS_UPDATED', targetType: 'system', detail: `Backup deleted: ${row.label}` })
  }

  /**
   * Restores an encrypted or plain backup over the live database. Caller must
   * relaunch the application afterwards. The current database is kept as a
   * safety copy next to the original.
   */
  restore(id: string, decrypt: (payload: Buffer) => Buffer, actor: Actor): void {
    const row = assertFound(this.db.get<{ id: string; path: string; mode: string; label: string }>('SELECT id, path, mode, label FROM database_backups WHERE id = ?', [id]), 'Backup')
    if (!fs.existsSync(row.path)) throw new AppError('NOT_FOUND', 'Backup file is missing on disk.')
    this.audit.record(actor, { eventType: 'BACKUP_RESTORED', targetType: 'system', detail: `Restore initiated from: ${row.label}` })
    const dbPath = this.db.path
    if (!dbPath || dbPath === ':memory:') throw new AppError('INTERNAL', 'Cannot restore an in-memory database.')
    const safety = `${dbPath}.pre-restore-${Date.now()}.bak`
    fs.copyFileSync(dbPath, safety)
    try {
      if (row.mode === 'encrypted') {
        const plain = decrypt(fs.readFileSync(row.path))
        this.db.close()
        fs.writeFileSync(dbPath, plain)
      } else {
        this.db.close()
        fs.copyFileSync(row.path, dbPath)
      }
    } catch (e) {
      // Attempt rollback from safety copy
      try {
        fs.copyFileSync(safety, dbPath)
      } catch {
        /* leave safety file for manual recovery */
      }
      throw new AppError('INTERNAL', `Restore failed and was rolled back. ${(e as Error).message}`)
    }
  }

  getDbPath(): string | null {
    return this.db.path !== ':memory:' ? this.db.path : null
  }
}
