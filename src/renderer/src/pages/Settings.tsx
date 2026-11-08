import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, FolderOpen, Gauge, Palette, ShieldCheck, Users2 } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSession } from '@/stores/session'
import { toastError, toastInfo, toastOk } from '@/stores/toast'
import { applyAppearance } from '@/lib/appearance'
import { bytes } from '@/lib/format'
import type { AppSettings, IntegrityResult } from '@shared/types'
import { DATE_FORMATS, FOLDER_PRESETS } from '@shared/constants'

type Tab = 'general' | 'security' | 'appearance' | 'database'

const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: 'general', label: 'General', icon: Gauge },
  { id: 'security', label: 'Security & Session', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance & Motion', icon: Palette },
  { id: 'database', label: 'Database & Backup', icon: Database },
]

export function SettingsPage() {
  const { user, app } = useSession()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<Tab>('general')
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null)
  const [checking, setChecking] = useState(false)

  const { data: settings, loading, reload } = useAsync(() => call(zeus.settings.get()), [])

  const apply = async (patch: Partial<AppSettings>) => {
    try {
      const updated = await call(zeus.settings.update(patch))
      applyAppearance(updated)
      toastOk('Settings updated', Object.keys(patch).slice(0, 3).join(', '))
      reload()
    } catch (e) {
      toastError('Update refused', e instanceof Error ? e.message : undefined)
    }
  }

  if (loading || !settings) return <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.4em] text-vault-muted">Loading configuration…</div>

  const s = settings
  const disabled = !isAdmin

  return (
    <div className="flex h-full min-h-0">
      {/* Tab rail */}
      <div className="flex w-52 shrink-0 flex-col border-r border-vault-border-soft p-3">
        <div className="micro-label px-2 pb-2">Configuration</div>
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2.5 rounded-sm px-3 py-2.5 text-left font-mono text-[9.5px] uppercase tracking-[0.18em] transition-colors ${tab === t.id ? 'bg-white/[0.05] text-vault-red' : 'text-vault-text2 hover:text-vault-text'}`}>
              <Icon size={13} strokeWidth={1.6} /> {t.label}
            </button>
          )
        })}
        <div className="mt-auto border-t border-vault-border-soft pt-3">
          <Link to="/account" className="flex items-center gap-2 px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-vault-muted hover:text-vault-text"><Users2 size={11} /> Personal settings → My Account</Link>
        </div>
      </div>

      <div className="vault-scroll min-w-0 flex-1 overflow-y-auto p-6">
        {!isAdmin && (
          <div className="mb-4 border border-vault-amber/30 bg-vault-amber/[0.06] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-amber">
            Read-only - administrator privileges required to persist changes
          </div>
        )}

        {tab === 'general' && (
          <div className="max-w-2xl space-y-5">
            <div>
              <h1 className="font-condensed text-3xl font-semibold tracking-wide text-vault-text">GENERAL</h1>
              <p className="micro-label mt-1">Application identity & localization</p>
            </div>
            <FieldRow label="Application Name">
              <input className="vault-input h-10 w-full px-3" defaultValue={s.appName} disabled={disabled} onBlur={(e) => e.target.value !== s.appName && void apply({ appName: e.target.value })} />
            </FieldRow>
            <FieldRow label="Theme">
              <select className="vault-select h-10 w-full px-2" value={s.theme} disabled={disabled} onChange={(e) => void apply({ theme: e.target.value as AppSettings['theme'] })}>
                <option value="dark">Zeus Dark (default)</option>
                <option value="graphite">Graphite Desaturated</option>
                <option value="light" disabled>Field Light - reserved</option>
              </select>
            </FieldRow>
            <FieldRow label="Timezone (display)">
              <input className="vault-input h-10 w-full px-3 font-mono" defaultValue={s.timezone} disabled={disabled} onBlur={(e) => e.target.value !== s.timezone && void apply({ timezone: e.target.value })} />
            </FieldRow>
            <FieldRow label="Date / Timestamp Format">
              <select className="vault-select h-10 w-full px-2" value={s.dateFormat} disabled={disabled} onChange={(e) => void apply({ dateFormat: e.target.value })}>
                {DATE_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Default Country (ISO-2)">
              <input className="vault-input h-10 w-full px-3 font-mono uppercase" maxLength={2} defaultValue={s.defaultCountry} disabled={disabled} onBlur={(e) => e.target.value.toUpperCase() !== s.defaultCountry && void apply({ defaultCountry: e.target.value.toUpperCase() })} />
            </FieldRow>
          </div>
        )}

        {tab === 'security' && (
          <div className="max-w-2xl space-y-5">
            <div>
              <h1 className="font-condensed text-3xl font-semibold tracking-wide text-vault-text">SECURITY & SESSION</h1>
              <p className="micro-label mt-1">Persistence ≠ open access - lock policy is independent</p>
            </div>
            <FieldRow label="Session Duration (days)" hint="Trusted-device lifetime. Default 90.">
              <input type="number" min={1} max={365} className="vault-input h-10 w-32 px-3 font-mono" defaultValue={s.sessionDurationDays} disabled={disabled} onBlur={(e) => Number(e.target.value) !== s.sessionDurationDays && void apply({ sessionDurationDays: Number(e.target.value) })} />
            </FieldRow>
            <ToggleRow label="Single Active Session" hint="New login revokes the previous session immediately." value={s.singleSession} disabled={disabled} onChange={(v) => void apply({ singleSession: v })} />
            <FieldRow label="Inactivity Lock" hint="Auto-seal vault after idle minutes.">
              <select className="vault-select h-10 w-48 px-2" value={s.inactivityLockMinutes} disabled={disabled} onChange={(e) => void apply({ inactivityLockMinutes: Number(e.target.value) })}>
                {[1, 5, 10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m} minute{m === 1 ? '' : 's'}</option>)}
              </select>
            </FieldRow>
            <ToggleRow label="Require Password On Unlock" hint="Re-entry required when the vault auto-seals." value={s.requirePasswordUnlock} disabled={disabled} onChange={(v) => void apply({ requirePasswordUnlock: v })} />
            <FieldRow label="Minimum Password Length">
              <input type="number" min={8} max={64} className="vault-input h-10 w-28 px-3 font-mono" defaultValue={s.passwordMinLength} disabled={disabled} onBlur={(e) => Number(e.target.value) !== s.passwordMinLength && void apply({ passwordMinLength: Number(e.target.value) })} />
            </FieldRow>
            <ToggleRow label="Require Uppercase" value={s.requireUpper} disabled={disabled} onChange={(v) => void apply({ requireUpper: v })} />
            <ToggleRow label="Require Number" value={s.requireNumber} disabled={disabled} onChange={(v) => void apply({ requireNumber: v })} />
            <ToggleRow label="Require Symbol" value={s.requireSymbol} disabled={disabled} onChange={(v) => void apply({ requireSymbol: v })} />
            <FieldRow label="Password History Depth" hint="Reuse prevention window.">
              <input type="number" min={0} max={24} className="vault-input h-10 w-28 px-3 font-mono" defaultValue={s.passwordHistory} disabled={disabled} onBlur={(e) => Number(e.target.value) !== s.passwordHistory && void apply({ passwordHistory: Number(e.target.value) })} />
            </FieldRow>
            <FieldRow label="Max Failed Attempts" hint="Lockout threshold before cooldown.">
              <input type="number" min={3} max={20} className="vault-input h-10 w-28 px-3 font-mono" defaultValue={s.loginMaxAttempts} disabled={disabled} onBlur={(e) => Number(e.target.value) !== s.loginMaxAttempts && void apply({ loginMaxAttempts: Number(e.target.value) })} />
            </FieldRow>
            <FieldRow label="Lockout Minutes">
              <input type="number" min={1} max={60} className="vault-input h-10 w-28 px-3 font-mono" defaultValue={s.loginLockMinutes} disabled={disabled} onBlur={(e) => Number(e.target.value) !== s.loginLockMinutes && void apply({ loginLockMinutes: Number(e.target.value) })} />
            </FieldRow>
            <ToggleRow label="Track Profile Views" hint="Dossier open counts recorded in archive statistics." value={s.trackViews} disabled={disabled} onChange={(v) => void apply({ trackViews: v })} />
            <FieldRow label="Clipboard Auto-Clear (seconds)" hint="Sensitive copies expire from the clipboard.">
              <input type="number" min={0} max={600} className="vault-input h-10 w-28 px-3 font-mono" defaultValue={s.clipboardClearSeconds} disabled={disabled} onBlur={(e) => Number(e.target.value) !== s.clipboardClearSeconds && void apply({ clipboardClearSeconds: Number(e.target.value) })} />
            </FieldRow>
            <McpCard disabled={disabled} />
          </div>
        )}

        {tab === 'appearance' && (
          <div className="max-w-2xl space-y-5">
            <div>
              <h1 className="font-condensed text-3xl font-semibold tracking-wide text-vault-text">APPEARANCE & MOTION</h1>
              <p className="micro-label mt-1">Signal density & animation intensity</p>
            </div>
            <FieldRow label="Animation Intensity">
              <select className="vault-select h-10 w-56 px-2" value={s.animationIntensity} disabled={disabled} onChange={(e) => void apply({ animationIntensity: e.target.value as AppSettings['animationIntensity'] })}>
                <option value="full">Full - GSAP motion everywhere</option>
                <option value="reduced">Reduced - minimal transitions</option>
                <option value="off">Off - instant state changes</option>
              </select>
            </FieldRow>
            <FieldRow label="Motion Preference">
              <select className="vault-select h-10 w-56 px-2" value={s.motionPreference} disabled={disabled} onChange={(e) => void apply({ motionPreference: e.target.value as AppSettings['motionPreference'] })}>
                <option value="system">Follow system (prefers-reduced-motion)</option>
                <option value="custom">Use Animation Intensity above</option>
              </select>
            </FieldRow>
            <FieldRow label="Density">
              <select className="vault-select h-10 w-56 px-2" value={s.tableDensity} disabled={disabled} onChange={(e) => void apply({ tableDensity: e.target.value as AppSettings['tableDensity'] })}>
                <option value="compact">Compact (intelligence terminal)</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </FieldRow>
            <FieldRow label="Font Scale" hint={`${Math.round(s.fontScale * 100)}%`}>
              <input type="range" min={0.85} max={1.3} step={0.05} value={s.fontScale} disabled={disabled} className="w-56 accent-[#E34B64]" onChange={(e) => void apply({ fontScale: Number(e.target.value) })} />
            </FieldRow>
            <FieldRow label="Profile Preview Behavior">
              <select className="vault-select h-10 w-56 px-2" value={s.previewBehavior} disabled={disabled} onChange={(e) => void apply({ previewBehavior: e.target.value as AppSettings['previewBehavior'] })}>
                <option value="proximity">Proximity zoom (default)</option>
                <option value="hover">Hover expand only</option>
                <option value="off">Disabled</option>
              </select>
            </FieldRow>
            <ToggleRow label="Background Texture" hint="Dot grid, orbital lines and film grain layers." value={s.backgroundTexture} disabled={disabled} onChange={(v) => void apply({ backgroundTexture: v })} />
            <ToggleRow label="Watermark Demo Records" hint="DEMO badges on fictional demonstration profiles." value={s.watermarkDemos} disabled={disabled} onChange={(v) => void apply({ watermarkDemos: v })} />
          </div>
        )}

        {tab === 'database' && (
          <div className="max-w-2xl space-y-5">
            <div>
              <h1 className="font-condensed text-3xl font-semibold tracking-wide text-vault-text">DATABASE & BACKUP</h1>
              <p className="micro-label mt-1">Local-first · encrypted · verifiable</p>
            </div>
            <div className="vault-panel p-4">
              <div className="micro-label">Export & Backup Destinations</div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldRow label="Export folder">
                  <select className="vault-select h-10 w-full px-2" value={s.exportFolderPreset} disabled={disabled} onChange={(e) => void apply({ exportFolderPreset: e.target.value as AppSettings['exportFolderPreset'] })}>
                    {FOLDER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Backup folder">
                  <select className="vault-select h-10 w-full px-2" value={s.backupFolderPreset} disabled={disabled} onChange={(e) => void apply({ backupFolderPreset: e.target.value as AppSettings['backupFolderPreset'] })}>
                    {FOLDER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </FieldRow>
              </div>
            </div>

            <NlpAliasesCard disabled={disabled} />

            <div className="vault-panel p-4">
              <div className="micro-label">Storage Location</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="truncate font-mono text-[10px] text-vault-text2" title={app?.dbPath}>{app?.dbPath ?? ' - '}</code>
                <button className="vault-btn vault-btn-ghost !px-2" onClick={() => void call(zeus.importexport.showItem(app?.dbPath ?? ''))}><FolderOpen size={12} /></button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 font-mono text-[9px] uppercase tracking-[0.16em] text-vault-muted">
                <div>DB SIZE<br /><span className="text-vault-text">{app ? bytes(app.dbBytes) : ' - '}</span></div>
                <div>ENCRYPTION<br /><span className="text-vault-green">AES-256-GCM</span></div>
                <div>KEY PROTECTION<br /><span className="text-vault-text">{app?.osKeychain ? 'OS Keychain' : 'Portable file'}</span></div>
              </div>
            </div>

            <div className="vault-panel p-4">
              <div className="flex items-center justify-between">
                <div className="micro-label">Integrity Check</div>
                <button className="vault-btn" disabled={checking} onClick={async () => { setChecking(true); try { setIntegrity(await call(zeus.security.integrity())) } catch (e) { toastError('Check failed', e instanceof Error ? e.message : undefined) } finally { setChecking(false) } }}>
                  {checking ? 'Scanning…' : 'Run Check'}
                </button>
              </div>
              {integrity && (
                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px] uppercase tracking-[0.14em] md:grid-cols-4">
                  <IntegrityCell label="Quick Check" value={integrity.quickCheck} ok={integrity.quickCheck === 'ok'} />
                  <IntegrityCell label="FK Violations" value={String(integrity.foreignKeyErrors)} ok={integrity.foreignKeyErrors === 0} />
                  <IntegrityCell label="Encrypted Fields" value={String(integrity.encryptedFields)} ok />
                  <IntegrityCell label="Decrypt Failures" value={String(integrity.encryptedFailures)} ok={integrity.encryptedFailures === 0} />
                  <IntegrityCell label="Duplicate Codes" value={String(integrity.duplicateCodes)} ok={integrity.duplicateCodes === 0} />
                  <IntegrityCell label="Checked" value={new Date(integrity.checkedAt).toLocaleTimeString()} ok />
                </div>
              )}
            </div>

            <div className="vault-panel flex items-center justify-between p-4">
              <div>
                <div className="micro-label">Encrypted Backups</div>
                <p className="mt-1 text-[11px] text-vault-text2">AES-256-GCM snapshots of the full database, plus restore with safety rollback.</p>
              </div>
              <Link to="/backups" className="vault-btn vault-btn-primary shrink-0">Open Backup Center →</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NlpAliasesCard({ disabled }: { disabled: boolean }) {
  const { data, reload } = useAsync(() => call(zeus.nlp.aliases()), [])
  const [alias, setAlias] = useState('')
  const [canonical, setCanonical] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (busy || !alias.trim() || !canonical.trim()) return
    setBusy(true)
    try {
      await call(zeus.nlp.addAlias({ alias: alias.trim(), canonical: canonical.trim() }))
      setAlias('')
      setCanonical('')
      toastOk('Alias saved')
      reload()
    } catch (e) {
      toastError('Alias refused', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const embed = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await call(zeus.nlp.embedAll())
      toastOk('Embeddings built', `${r.embedded} profile(s) embedded locally`)
    } catch (e) {
      toastError('Embedding failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vault-panel p-4">
      <div className="flex items-center justify-between">
        <div className="micro-label">Intelligence Engine · Aliases & Embeddings</div>
        <button className="vault-btn" disabled={disabled || busy} onClick={() => void embed()}>Build embeddings (all profiles)</button>
      </div>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-muted">User aliases expand natural-language queries · embeddings power semantic search (100% local)</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="vault-input h-9 min-w-32 flex-1 px-2 text-[11px]" placeholder="Alias (e.g. telco)" value={alias} onChange={(e) => setAlias(e.target.value)} disabled={disabled} aria-label="Alias" />
        <input className="vault-input h-9 min-w-32 flex-1 px-2 text-[11px]" placeholder="Canonical (e.g. telecom)" value={canonical} onChange={(e) => setCanonical(e.target.value)} disabled={disabled} aria-label="Canonical value" />
        <button className="vault-btn vault-btn-primary" disabled={disabled || busy} onClick={() => void add()}>Add alias</button>
      </div>
      <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
        {(data ?? []).map((a) => (
          <div key={a.alias} className="flex items-center justify-between border border-white/[0.06] px-2 py-1.5 font-mono text-[10px]">
            <span className="text-vault-text2">{a.alias} → <span className="text-vault-text">{a.canonical}</span></span>
            <button className="text-vault-muted hover:text-vault-red" disabled={disabled} onClick={() => void call(zeus.nlp.deleteAlias(a.alias)).then(() => reload()).catch(() => {})} aria-label={`Delete alias ${a.alias}`}>✕</button>
          </div>
        ))}
        {(data ?? []).length === 0 && <div className="py-2 font-mono text-[9px] text-vault-muted">No custom aliases yet</div>}
      </div>
    </div>
  )
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] pb-4">
      <div className="max-w-[55%]">
        <div className="text-[11.5px] font-medium text-vault-text">{label}</div>
        {hint && <div className="mt-0.5 text-[9.5px] leading-snug text-vault-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function McpCard({ disabled }: { disabled: boolean }) {
  const [info, setInfo] = useState<{ enabled: boolean; running: boolean; port: number; hasToken: boolean; token: string | null; url: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await call(zeus.mcp.getInfo())
      setInfo(r)
    } catch {
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setEnabled = async (v: boolean) => {
    try {
      await call(zeus.mcp.setEnabled(v))
      await load()
      toastOk(v ? 'MCP layer enabled' : 'MCP layer disabled')
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : undefined)
    }
  }

  const regenerate = async () => {
    try {
      const r = await call(zeus.mcp.regenerateToken())
      await load()
      toastInfo('Local token reset', r.token.slice(0, 8) + '...')
    } catch (e) {
      toastError('Failed', e instanceof Error ? e.message : undefined)
    }
  }

  return (
    <div className="vault-panel p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="micro-label">MCP Layer - Agent Access</div>
          <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.18em] text-vault-muted">Loopback only · token gated</div>
        </div>
        <ToggleRow label="" value={info?.enabled ?? false} disabled={disabled || loading} onChange={(v) => void setEnabled(v)} hint="" />
      </div>
      {info && (
        <div className="mt-3 space-y-2 font-mono text-[9px]">
          <Row label="Mode" value="Streamable HTTP (stateless)" />
          <Row label="Port" value={String(info.port)} />
          <Row label="Endpoint" value={info.url} />
          <Row label="Auth" value={info.hasToken ? 'local bearer token set' : 'none yet'} ok={info.hasToken} />
          <Row label="API keys" value="Manage on the Overview dashboard (04 - Access)" />
        </div>
      )}
      <div className="mt-3">
        <div className="micro-label mb-1.5">Client config (paste into MCP clients)</div>
        <pre className="vault-scroll overflow-x-auto border border-white/[0.08] bg-black/40 p-3 font-mono text-[9px] leading-relaxed text-vault-text2">{`{
  "mcpServers": {
    "zeus-vault": {
      "type": "http",
      "url": "${info?.url ?? 'http://127.0.0.1:7421/mcp'}",
      "headers": { "Authorization": "Bearer <API KEY, generated on the Overview dashboard>" }
    }
  }
}`}</pre>
        <div className="mt-2 flex gap-2">
          <button className="vault-btn !px-2.5" onClick={() => void regenerate()} disabled={disabled || loading}>Reset local token</button>
          <button className="vault-btn vault-btn-ghost" onClick={() => void load()}>Refresh</button>
        </div>
        <p className="mt-2 font-mono text-[8.5px] leading-relaxed text-vault-muted">MCP calls run under your current session. Tools return structured errors when the vault is locked. The server never listens on the network, only on loopback. Keys are generated and revoked from the Overview dashboard card (08 - Access).</p>
      </div>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="micro-label !text-[8px]">{label}</span>
      <span className={ok === undefined ? 'text-vault-text' : ok ? 'text-vault-green' : 'text-vault-muted'}>{value}</span>
    </div>
  )
}

function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] pb-4">
      <div className="max-w-[55%]">
        <div className="text-[11.5px] font-medium text-vault-text">{label}</div>
        {hint && <div className="mt-0.5 text-[9.5px] leading-snug text-vault-muted">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${value ? 'border-vault-red/70 bg-vault-red' : 'border-white/15 bg-white/[0.06]'} ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
      >
        <span
          className="absolute inset-y-[3px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#0D0507] shadow transition-[transform,background] duration-150"
          style={{ transform: value ? 'translateX(24px)' : 'translateX(4px)' }}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${value ? 'bg-vault-text' : 'bg-vault-muted'}`} />
        </span>
      </button>
    </div>
  )
}

function IntegrityCell({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="border border-white/[0.06] bg-white/[0.02] p-2">
      <div className="text-vault-muted">{label}</div>
      <div className={`mt-0.5 truncate ${ok ? 'text-vault-green' : 'text-vault-red'}`} title={value}>{value}</div>
    </div>
  )
}
