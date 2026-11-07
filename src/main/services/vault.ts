import fs from 'node:fs'
import path from 'node:path'
import {
  decryptBuffer,
  deriveSubkey,
  encryptBuffer,
  fingerprintHex,
  randomHex,
} from '../lib/crypto'
import { Db } from '../db/sqlite'
import { migrate } from '../db/schema'
import type { KeyFile, KeyProtection } from './keyring'
import { osReference, unwrapMaster, wrapMaster } from './keyring'

export interface VaultPaths {
  dataDir: string
  imagesDir: string
  backupsDir: string
  exportsDir: string
  logsDir: string
  keyFilePath: string
  dbPath: string
}

export function resolveVaultPaths(rootDataDir: string): VaultPaths {
  const dataDir = path.join(rootDataDir, 'vault-data')
  return {
    dataDir,
    imagesDir: path.join(dataDir, 'images'),
    backupsDir: path.join(dataDir, 'backups'),
    exportsDir: path.join(dataDir, 'exports'),
    logsDir: path.join(dataDir, 'logs'),
    keyFilePath: path.join(dataDir, 'vault.key'),
    dbPath: path.join(dataDir, 'vault.db'),
  }
}

export class Vault {
  readonly paths: VaultPaths
  readonly db: Db
  readonly masterKey: Buffer
  readonly fieldKey: Buffer
  readonly backupKey: Buffer
  readonly fingerprints: { field: number; db: number }
  readonly createdAt: string
  readonly protection: KeyProtection

  private constructor(paths: VaultPaths, db: Db, master: Buffer, keyFile: KeyFile) {
    this.paths = paths
    this.db = db
    this.masterKey = master
    this.fieldKey = deriveSubkey(master, 'zeus-vault/field-encryption/v1')
    this.backupKey = deriveSubkey(master, 'zeus-vault/backup-encryption/v1')
    this.fingerprints = {
      field: fingerprintHex(this.fieldKey),
      db: fingerprintHex(deriveSubkey(master, 'zeus-vault/database-binding/v1')),
    }
    this.createdAt = keyFile.createdAt
    this.protection = keyFile.protection
  }

  static isInitialized(paths: VaultPaths): boolean {
    return fs.existsSync(paths.keyFilePath) && fs.existsSync(paths.dbPath)
  }

  static readKeyFile(paths: VaultPaths): KeyFile {
    return JSON.parse(fs.readFileSync(paths.keyFilePath, 'utf8')) as KeyFile
  }

  static writeKeyFile(paths: VaultPaths, file: KeyFile): void {
    const tmp = `${paths.keyFilePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, paths.keyFilePath)
  }

  static ensureDirs(paths: VaultPaths): void {
    for (const dir of [paths.dataDir, paths.imagesDir, paths.backupsDir, paths.exportsDir, paths.logsDir]) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /** Creates a brand new vault protected by the OS keychain wrapper key. */
  static initialize(paths: VaultPaths, wrapKey: Buffer): Vault {
    Vault.ensureDirs(paths)
    const master = Buffer.from(randomHex(32), 'hex')
    const file = wrapMaster(master, wrapKey, 'system', osReference())
    file.fingerprint = fingerprintHex(deriveSubkey(master, 'zeus-vault/field-encryption/v1'))
    Vault.writeKeyFile(paths, file)
    return Vault.open(paths, wrapKey)
  }

  static open(paths: VaultPaths, wrapKey: Buffer): Vault {
    Vault.ensureDirs(paths)
    const keyFile = Vault.readKeyFile(paths)
    const master = unwrapMaster(keyFile, wrapKey)
    const db = new Db(paths.dbPath)
    const { applied } = migrate(db)
    if (applied.includes(4)) {
      // Rewrite the file so deleted secret copies are physically gone.
      try { db.exec('VACUUM') } catch { /* ignore */ }
    }
    const binding = db.value<string>(`SELECT value FROM application_settings WHERE key = 'vault.binding'`) ?? ''
    if (binding && binding !== `fp:${keyFile.fingerprint}`) {
      db.close()
      throw new Error('Vault key does not match this database (binding mismatch).')
    }
    const now = new Date().toISOString()
    if (!binding) {
      db.run(`INSERT OR REPLACE INTO application_settings(key, value, updated_at) VALUES ('vault.binding', ?, ?)`, [
        `fp:${keyFile.fingerprint}`,
        now,
      ])
      db.run(`INSERT OR IGNORE INTO application_settings(key, value, updated_at) VALUES ('vault.created_at', ?, ?)`, [
        keyFile.createdAt,
        now,
      ])
    }
    return new Vault(paths, db, master, keyFile)
  }

  /** Re-wraps the master key under a new wrapping key (e.g. after OS keychain reset). */
  rewrap(wrapKey: Buffer, protection: KeyProtection): void {
    const file = wrapMaster(this.masterKey, wrapKey, protection, protection === 'system' ? osReference() : null)
    file.createdAt = this.createdAt
    file.fingerprint = this.fingerprints.field
    Vault.writeKeyFile(this.paths, file)
  }

  createEncryptedSnapshot(): Buffer {
    const snapshotPath = path.join(this.paths.dataDir, `snapshot-${randomHex(6)}.db`)
    this.db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`)
    try {
      return encryptBuffer(fs.readFileSync(snapshotPath), this.backupKey)
    } finally {
      fs.rmSync(snapshotPath, { force: true })
    }
  }

  decryptSnapshot(payload: Buffer): Buffer {
    return decryptBuffer(payload, this.backupKey)
  }

  sizeOnDisk(): number {
    try {
      let total = fs.statSync(this.paths.dbPath).size
      const wal = `${this.paths.dbPath}-wal`
      if (fs.existsSync(wal)) total += fs.statSync(wal).size
      return total
    } catch {
      return 0
    }
  }

  close(): void {
    this.db.close()
  }
}
