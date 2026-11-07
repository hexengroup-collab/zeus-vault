import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileSpreadsheet, FolderOpen, Upload, Wand2 } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { toastError, toastOk } from '@/stores/toast'
import type { ImportPreview, ImportResult } from '@shared/types'

const TARGET_FIELDS: { key: string; label: string }[] = [
  { key: 'fullName', label: 'Full Name *' },
  { key: 'username', label: 'Username' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'country', label: 'Country' },
  { key: 'countryIso2', label: 'Country ISO-2' },
  { key: 'state', label: 'State / Province' },
  { key: 'city', label: 'City' },
  { key: 'postalCode', label: 'ZIP / Postal Code' },
  { key: 'preferredLanguage', label: 'Preferred Language' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'primaryPhone', label: 'Primary Phone' },
  { key: 'secondaryPhone', label: 'Secondary Phone' },
  { key: 'primaryEmail', label: 'Primary Email' },
  { key: 'secondaryEmail', label: 'Secondary Email' },
  { key: 'website', label: 'Website' },
  { key: 'street', label: 'Street Address' },
  { key: 'apartment', label: 'Apartment / Suite' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'company', label: 'Company' },
  { key: 'industry', label: 'Industry' },
  { key: 'loginUsername', label: 'Login Username' },
  { key: 'loginEmail', label: 'Login Email' },
  { key: 'accountProvider', label: 'Account Provider' },
  { key: 'tags', label: 'Tags (comma-separated)' },
  { key: 'notes', label: 'Notes' },
]

export function ImportWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'select' | 'mapping' | 'result'>('select')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [filePath, setFilePath] = useState<string>('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping])

  const pick = async () => {
    const picked = await call(zeus.importexport.pickFile())
    if (!picked) return
    try {
      const p = await call(zeus.importexport.preview(picked.filePath))
      setPreview(p)
      setFilePath(picked.filePath)
      setMapping({ ...p.suggestedMapping })
      setStep('mapping')
    } catch (e) {
      toastError('Preview failed', e instanceof Error ? e.message : undefined)
    }
  }

  const execute = async () => {
    if (!filePath || busy) return
    setBusy(true)
    try {
      const r = await call(zeus.importexport.execute({ filePath, mapping }))
      setResult(r)
      setStep('result')
      toastOk('Import complete', `${r.imported} created · ${r.duplicates} duplicates skipped`)
    } catch (e) {
      toastError('Import failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setStep('select'); setPreview(null); setFilePath(''); setMapping({}); setResult(null)
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="micro-label">Intake Pipeline</div>
      <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">IMPORT WIZARD</h1>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">CSV · JSON · XLSX - mapped, validated, de-duplicated</p>

      {/* Steps indicator */}
      <div className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">
        {['select', 'mapping', 'result'].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className={step === s ? 'text-vault-red' : step === 'result' || (step === 'mapping' && s === 'select') ? 'text-vault-green' : ''}>{String(i + 1).padStart(2, '0')} {s === 'select' ? 'Source' : s === 'mapping' ? 'Map Fields' : 'Result'}</span>
            {i < 2 && <span> - </span>}
          </span>
        ))}
      </div>

      {step === 'select' && (
        <div className="mt-6 flex flex-col items-center gap-4 border border-dashed border-white/[0.14] bg-white/[0.015] px-6 py-16 text-center">
          <Upload size={34} strokeWidth={1} className="text-vault-muted" />
          <div>
            <div className="font-condensed text-2xl font-semibold tracking-wide text-vault-text">SELECT SOURCE FILE</div>
            <p className="mt-1 max-w-md text-[11px] leading-relaxed text-vault-text2">First row must contain column headers. Full Name is the only required field. Duplicates are detected by email or username.</p>
          </div>
          <button className="vault-btn vault-btn-primary h-11 !px-8" onClick={() => void pick()}><FolderOpen size={13} /> Choose File</button>
        </div>
      )}

      {step === 'mapping' && preview && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-vault-border-soft bg-[#0E1014] px-4 py-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={18} className="text-vault-green" strokeWidth={1.5} />
              <div>
                <div className="text-[12px] font-semibold text-vault-text">{preview.fileName}</div>
                <div className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-vault-muted">{preview.kind} · {preview.totalRows} row(s) · {preview.columns.length} column(s) · auto-mapped {mappedCount}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="vault-btn vault-btn-ghost" onClick={reset}>Back</button>
              <button className="vault-btn vault-btn-primary" onClick={() => void execute()} disabled={busy || !mappedCount}>{busy ? 'Importing…' : `Import ${preview.totalRows} Row(s)`}</button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto vault-scroll border border-vault-border-soft">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#0E1013]">
                <tr className="border-b border-vault-border">
                  <th className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">Source Column</th>
                  <th className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">Maps To</th>
                  <th className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">Sample</th>
                </tr>
              </thead>
              <tbody>
                {preview.columns.map((col) => (
                  <tr key={col} className="row-alt border-b border-white/[0.05]">
                    <td className="px-3 py-1.5 font-mono text-[10px] text-vault-text">{col}</td>
                    <td className="px-3 py-1.5">
                      <select className={`vault-select h-8 w-56 px-2 text-[10px] ${mapping[col] ? 'border-vault-green/40' : ''}`} value={mapping[col] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))} aria-label={`Map ${col}`}>
                        <option value=""> - Skip column - </option>
                        {TARGET_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </td>
                    <td className="max-w-56 truncate px-3 py-1.5 font-mono text-[9px] text-vault-muted" title={String(preview.rows[0]?.[col] ?? '')}>{String(preview.rows[0]?.[col] ?? ' - ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-start gap-2 border border-vault-amber/25 bg-vault-amber/[0.05] px-3 py-2 text-[10px] leading-snug text-vault-amber/90">
            <Wand2 size={12} className="mt-0.5 shrink-0" />
            Unmapped columns are discarded. Rows already present (same email or username) are counted as duplicates and skipped. Every imported record is tagged “Imported” in internal notes and written to the audit ledger.
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="mt-6">
          <div className="flex flex-col items-center gap-3 border border-vault-border-soft bg-[#0E1014] px-6 py-10 text-center">
            <CheckCircle2 size={40} strokeWidth={1.25} className="text-vault-green" />
            <div className="font-condensed text-3xl font-semibold tracking-wide text-vault-text">INTAKE COMPLETE</div>
            <div className="grid grid-cols-3 gap-px border border-white/[0.08] bg-white/[0.05]">
              {[
                { n: result.imported, label: 'Imported', tone: 'text-vault-green' },
                { n: result.duplicates, label: 'Duplicates Skipped', tone: 'text-vault-amber' },
                { n: result.skipped, label: 'Rejected', tone: 'text-vault-red' },
              ].map((s) => (
                <div key={s.label} className="bg-[#0E1014] px-8 py-5">
                  <div className={`stat-number text-5xl leading-none ${s.tone}`}>{s.n}</div>
                  <div className="micro-label mt-2 !text-[8px]">{s.label}</div>
                </div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 w-full max-w-2xl text-left">
                <div className="micro-label mb-1">Row Errors</div>
                <div className="max-h-48 overflow-y-auto vault-scroll border border-white/[0.08]">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex gap-3 border-b border-white/[0.05] px-3 py-1.5 font-mono text-[9px] last:border-b-0">
                      <span className="text-vault-red">ROW {e.row}</span>
                      <span className="text-vault-text2">{e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button className="vault-btn" onClick={reset}>Import Another</button>
              <button className="vault-btn vault-btn-primary" onClick={() => navigate('/profiles')}>Open Archive →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
