import { useState } from 'react'
import { Database, Download, FileArchive, History, RotateCcw, Trash2, ShieldCheck } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSession } from '@/stores/session'
import { ConfirmModal } from '@/components/ConfirmModal'
import { toastError, toastOk } from '@/stores/toast'
import { bytes } from '@/lib/format'
import { formatTimestamp, relativeTime } from '@shared/time'
import type { BackupEntry } from '@shared/types'

export function Backups() {
  const { user } = useSession()
  const isAdmin = user?.role === 'admin'
  const { data: backups, loading, reload } = useAsync(() => call(zeus.backup.list()), [])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<'encrypted' | 'plain' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)

  const create = async (mode: 'encrypted' | 'plain') => {
    if (busy) return
    setBusy(mode)
    try {
      const entry = await call(zeus.backup.create({ mode, label: label.trim() || undefined }))
      setLabel('')
      toastOk('Backup sealed', `${bytes(entry.size)} · ${entry.mode}`)
      reload()
    } catch (e) {
      toastError('Backup failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="micro-label flex items-center gap-2"><Database size={10} /> Vault Continuity</div>
      <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">BACKUP & RESTORE</h1>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">Encrypted point-in-time snapshots · restore with automatic safety copy</p>

      {/* Create */}
      {isAdmin && (
        <div className="vault-panel mt-5 flex flex-wrap items-center gap-3 p-4">
          <input className="vault-input h-10 min-w-52 flex-1 px-3" placeholder="Backup label (optional)…" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Backup label" />
          <button className="vault-btn vault-btn-primary" onClick={() => void create('encrypted')} disabled={!!busy}>
            <ShieldCheck size={12} /> {busy === 'encrypted' ? 'Sealing…' : 'Encrypted Backup'}
          </button>
          <button className="vault-btn" onClick={() => void create('plain')} disabled={!!busy} title="Unencrypted SQLite copy - handle with care">
            <Download size={12} /> {busy === 'plain' ? 'Copying…' : 'Plain Copy'}
          </button>
        </div>
      )}

      {/* List */}
      <div className="mt-4 overflow-x-auto vault-scroll border border-vault-border-soft">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[#0E1013]">
            <tr className="border-b border-vault-border">
              {['Snapshot', 'Mode', 'Size', 'Created', 'By', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-vault-text2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(backups ?? []).map((b) => (
              <tr key={b.id} className="row-alt border-b border-white/[0.05]">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <FileArchive size={13} strokeWidth={1.5} className={b.mode === 'encrypted' ? 'text-vault-green' : 'text-vault-amber'} />
                    <div>
                      <div className="max-w-64 truncate text-[11px] font-medium text-vault-text" title={b.path}>{b.label}</div>
                      <div className="font-mono text-[7.5px] text-vault-muted">{b.id.slice(0, 8)} · {b.status}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5"><span className={`chip ${b.mode === 'encrypted' ? '!border-vault-green/40 !text-vault-green' : '!border-vault-amber/40 !text-vault-amber'}`}>{b.mode}</span></td>
                <td className="px-3 py-2.5 font-mono text-[9.5px] text-vault-text2">{bytes(b.size)}</td>
                <td className="px-3 py-2.5"><div className="font-mono text-[8.5px] text-vault-text2">{formatTimestamp(b.createdAt)}</div><div className="font-mono text-[7.5px] text-vault-muted">{relativeTime(b.createdAt)}</div></td>
                <td className="px-3 py-2.5 font-mono text-[8.5px] text-vault-text2">{b.createdBy}</td>
                <td className="px-3 py-2.5">
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-text" title="Restore this snapshot" onClick={() => setRestoreTarget(b)}><RotateCcw size={13} /></button>
                      <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-red" title="Delete snapshot" onClick={() => setDeleteTarget(b)}><Trash2 size={13} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && backups && backups.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center"><div className="font-mono text-[10px] uppercase tracking-[0.3em] text-vault-muted">No snapshots yet - create the first one above</div></td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-6 text-center font-mono text-[9px] uppercase tracking-[0.35em] text-vault-muted">Reading vault manifest…</div>}
      </div>

      <div className="mt-3 flex items-start gap-2 border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[9.5px] leading-snug text-vault-text2">
        <History size={12} className="mt-0.5 shrink-0 text-vault-muted" />
        Restore replaces the live database and immediately relaunches Zeus Vault. The current database is kept alongside it as <code className="font-mono">vault.db.pre-restore-*.bak</code> for manual recovery. Encrypted snapshots can only be unsealed by this vault's master key.
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete snapshot"
        message={`“${deleteTarget?.label}” will be permanently removed from disk. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await call(zeus.backup.delete(deleteTarget.id))
            toastOk('Snapshot deleted', deleteTarget.label)
            reload()
          } catch (e) {
            toastError('Delete failed', e instanceof Error ? e.message : undefined)
          }
        }}
      />
      <ConfirmModal
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        title="Restore snapshot"
        message={`The live database will be replaced with “${restoreTarget?.label}” (${restoreTarget ? formatTimestamp(restoreTarget.createdAt) : ''}) and Zeus Vault will relaunch. A safety copy of the current database is kept. Continue?`}
        confirmLabel="Restore & Relaunch"
        danger={false}
        onConfirm={async () => {
          if (!restoreTarget) return
          try {
            await call(zeus.backup.restore(restoreTarget.id))
            // The application relaunches itself; nothing else to do.
          } catch (e) {
            toastError('Restore failed', e instanceof Error ? e.message : undefined)
          }
        }}
      />
    </div>
  )
}
