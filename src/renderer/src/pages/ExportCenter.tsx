import { useState } from 'react'
import { AlertTriangle, Download, FileBadge, FileJson, FileSpreadsheet, FolderOpen } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSession } from '@/stores/session'
import { toastError, toastOk } from '@/stores/toast'
import { ROLE_LABELS, FOLDER_PRESETS } from '@shared/constants'
import type { FolderPreset } from '@shared/types'

type Format = 'csv' | 'json' | 'xlsx' | 'pdf'

const FORMATS: { id: Format; label: string; ext: string; note: string; icon: typeof FileJson }[] = [
  { id: 'csv', label: 'CSV', ext: '.csv', note: 'Universal spreadsheet interchange', icon: FileSpreadsheet },
  { id: 'json', label: 'JSON', ext: '.json', note: 'Structured records, re-importable', icon: FileJson },
  { id: 'xlsx', label: 'XLSX', ext: '.xlsx', note: 'Excel workbook, frozen header', icon: FileSpreadsheet },
  { id: 'pdf', label: 'PDF Summary', ext: '.pdf', note: 'A4 landscape contact register', icon: FileBadge },
]

export function ExportCenter() {
  const { user } = useSession()
  const [format, setFormat] = useState<Format>('csv')
  const [scope, setScope] = useState<'all' | 'active' | 'archived' | 'favorites'>('all')
  const [includeSensitive, setIncludeSensitive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastFile, setLastFile] = useState<string | null>(null)
  const { data: settings, reload: reloadSettings } = useAsync(() => call(zeus.settings.get()), [])
  const canExportSensitive = user?.role !== 'readonly'

  const setPreset = async (preset: FolderPreset) => {
    try {
      await call(zeus.settings.update({ exportFolderPreset: preset }))
      reloadSettings()
      toastOk('Destination saved', preset)
    } catch (e) {
      toastError('Update refused', e instanceof Error ? e.message : undefined)
    }
  }

  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      const filters = scope === 'all' ? { view: 'all-status' as const } : { view: scope }
      const preset = settings?.exportFolderPreset ?? 'custom'
      const targetPath = preset === 'vault' || preset === 'custom' ? (await call(zeus.importexport.pickSave({ format, defaultName: `zeus-vault-export.${format}` })))?.filePath : undefined
      if ((preset === 'vault' || preset === 'custom') && !targetPath) return
      const result = await call(zeus.importexport.exportProfiles({ filters, format, includeSensitive: includeSensitive && canExportSensitive, targetPath }))
      setLastFile(result.filePath)
      toastOk('Export complete', `${result.count} record(s) -> ${result.filePath}`)
    } catch (e) {
      toastError('Export failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="micro-label">Data Egress Control</div>
      <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">EXPORT CENTER</h1>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">Bulk egress is written to the audit ledger</p>

      <div className="mt-6 vault-panel p-5">
        <div className="micro-label mb-2">01 - Scope</div>
        <div className="flex flex-wrap gap-2">
          {([['all', 'All Records'], ['active', 'Active Only'], ['archived', 'Archived Only'], ['favorites', 'Favorites (mine)']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setScope(id)} className={`px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors ${scope === id ? 'bg-vault-red/90 text-[#0D0507]' : 'border border-white/10 text-vault-text2 hover:text-vault-text'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="micro-label mb-2 mt-5">02 - Format</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {FORMATS.map((f) => {
            const Icon = f.icon
            return (
              <button key={f.id} onClick={() => setFormat(f.id)} className={`flex flex-col items-center gap-1.5 border px-3 py-4 transition-all ${format === f.id ? 'border-vault-red/60 bg-vault-red/[0.08]' : 'border-white/[0.08] hover:border-white/20'}`}>
                <Icon size={20} strokeWidth={1.25} className={format === f.id ? 'text-vault-red' : 'text-vault-text2'} />
                <span className="font-mono text-[10px] tracking-[0.14em] text-vault-text">{f.label}</span>
                <span className="text-center font-mono text-[7px] uppercase leading-snug tracking-[0.12em] text-vault-muted">{f.note}</span>
              </button>
            )
          })}
        </div>

        <div className="micro-label mb-2 mt-5">03 - Sensitivity</div>
        <label className={`flex items-start gap-3 border p-3 ${canExportSensitive ? 'cursor-pointer border-white/[0.08] bg-white/[0.02]' : 'cursor-not-allowed border-white/[0.06] opacity-50'}`}>
          <button type="button" role="checkbox" aria-checked={includeSensitive} disabled={!canExportSensitive} onClick={() => setIncludeSensitive((v) => !v)} className={`mt-0.5 h-4 w-4 shrink-0 rounded-[2px] border ${includeSensitive ? 'border-vault-red bg-vault-red' : 'border-white/20'}`}>
            {includeSensitive && <svg viewBox="0 0 16 16" className="h-4 w-4 text-[#0D0507]"><path fill="currentColor" d="M6.2 12.4 2.4 8.6l1.5-1.5 2.3 2.3 5.9-5.9 1.5 1.5z" /></svg>}
          </button>
          <span>
            <span className="block text-[11px] font-semibold text-vault-text">Include account passwords</span>
            <span className="mt-0.5 block text-[9.5px] leading-snug text-vault-text2">Adds the decrypted account password column. Requires {canExportSensitive ? 'your explicit confirmation' : `a role above Read-Only (${ROLE_LABELS[user?.role ?? 'readonly']})`}. This action is logged with EXPORT_COMPLETED.</span>
          </span>
        </label>
        {includeSensitive && (
          <div className="mt-2 flex items-center gap-2 border border-vault-red/40 bg-vault-red/[0.08] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-vault-red">
            <AlertTriangle size={12} /> Credentials will be written in plaintext to the export file
          </div>
        )}

        <div className="micro-label mb-2 mt-5">04 - Destination</div>
        <div className="flex flex-wrap items-center gap-2">
          {FOLDER_PRESETS.map((p) => (
            <button key={p.id} onClick={() => void setPreset(p.id)} className={`px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${(settings?.exportFolderPreset ?? 'custom') === p.id ? 'bg-vault-red/90 text-[#0D0507]' : 'border border-white/10 text-vault-text2 hover:text-vault-text'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.18em] text-vault-muted">Concrete folders export directly · vault/custom open the save dialog</p>

        <button className="vault-btn vault-btn-primary mt-6 h-11 w-full justify-center" onClick={() => void run()} disabled={busy}>
          <Download size={13} /> {busy ? 'Exporting…' : 'Execute Export'}
        </button>
        {lastFile && (
          <button className="vault-btn vault-btn-ghost mt-2 w-full justify-center" onClick={() => void call(zeus.importexport.showItem(lastFile))}>
            <FolderOpen size={12} /> Reveal in folder
          </button>
        )}
      </div>

      <p className="mt-4 text-center font-mono text-[8px] uppercase leading-relaxed tracking-[0.25em] text-vault-muted">
        Exports land in the vault exports directory · never synced, never uploaded<br />
        Dossier PDFs (single record) are available from each profile page
      </p>
    </div>
  )
}
