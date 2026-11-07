import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import {
  ArrowRight,
  Archive,
  Database,
  Download,
  Eye,
  Plus,
  FilePlus2,
  Globe2,
  PlusCircle,
  Search,
  Star,
  Users,
  Zap,
  ChevronDown,
  Copy,
  Trash2,
} from 'lucide-react'
import { useAsync } from '@/lib/useAsync'
import { call, zeus } from '@/lib/api'
import { Avatar } from '@/components/Avatar'
import { FlagIcon } from '@/components/FlagIcon'
import { formatTimestamp, relativeTime } from '@shared/time'
import { useSession } from '@/stores/session'
import { toastError, toastInfo, toastOk } from '@/stores/toast'
import { copyText } from '@/lib/clipboard'

export function Overview() {
  const navigate = useNavigate()
  const { user } = useSession()
  const { data, loading } = useAsync(() => call(zeus.dashboard.overview()), [])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const localHour = new Date(now).getHours()
  const daypart = localHour < 12 ? 'MORNING' : localHour < 18 ? 'AFTERNOON' : 'EVENING'

  const statRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (!data) return
    statRefs.current.forEach((el, i) => {
      if (!el) return
      gsap.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, delay: i * 0.05, ease: 'power3.out' })
    })
  }, [data])

  if (loading || !data) {
    return <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.4em] text-vault-muted">Compiling dossier index…</div>
  }

  const s = data.stats
  const stats = [
    { label: 'Total Profiles', value: s.totalProfiles, delta: data.totalProfilesDelta >= 0 ? `+${data.totalProfilesDelta}` : `${data.totalProfilesDelta}`, tone: 'text-vault-text' },
    { label: 'Active', value: s.activeProfiles, tone: 'text-vault-green' },
    { label: 'Archived', value: s.archivedProfiles, tone: 'text-vault-amber' },
    { label: 'Countries', value: s.totalCountries, tone: 'text-vault-text' },
    { label: 'Created 30d', value: s.recentlyCreated, tone: 'text-vault-text' },
    { label: 'Updated 30d', value: s.recentlyUpdated, tone: 'text-vault-text' },
    { label: 'Users', value: s.totalUsers, tone: 'text-vault-text' },
    { label: 'Live Sessions', value: s.activeSessions, tone: 'text-vault-red' },
  ]

  return (
    <div className="vault-scroll min-h-full">
      {/* Command strip */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-vault-border-soft px-6 pb-5 pt-6">
        <div>
          <div className="micro-label">Operational Overview · Local {daypart} · {formatTimestamp(new Date().toISOString(), 'military')}</div>
          <h1 className="mt-1.5 font-condensed text-5xl font-bold leading-none tracking-tight text-vault-text">
            GOOD {daypart},<br />
            <span className="text-vault-red">{(user?.fullName.split(' ')[0] ?? 'Operator').toUpperCase()}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="vault-btn" onClick={() => navigate('/search')}><Search size={12} /> Search</button>
          <button className="vault-btn" onClick={() => navigate('/export')}><Download size={12} /> Export</button>
          <button className="vault-btn vault-btn-primary" onClick={() => navigate('/profiles/new')}><PlusCircle size={12} /> New Dossier</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-px border-b border-vault-border-soft bg-white/[0.04] md:grid-cols-4 xl:grid-cols-8">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            ref={(el) => { statRefs.current[i] = el }}
            className="group bg-[#0C0E11] px-4 py-4 transition-colors hover:bg-[#0E1014]"
          >
            <div className="micro-label !text-[8px]">{stat.label}</div>
            <div className={`stat-number mt-1.5 text-4xl leading-none ${stat.tone}`}>{stat.value}</div>
            {stat.delta && <div className="mt-1 font-mono text-[8.5px] text-vault-text2">{stat.delta} vs prior 30d</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-12">
        {/* LEFT - recent records */}
        <section className="xl:col-span-4">
          <div className="vault-panel flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-vault-border-soft px-4 py-3">
              <div>
                <div className="micro-label">01 - Signals</div>
                <h2 className="font-condensed text-lg font-semibold uppercase tracking-[0.12em] text-vault-text">Recent Records</h2>
              </div>
              <button className="font-mono text-[9px] uppercase tracking-[0.2em] text-vault-red hover:underline" onClick={() => navigate('/profiles')}>All Profiles →</button>
            </div>
            <div className="vault-scroll min-h-0 flex-1 overflow-y-auto">
              {data.recentProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/profiles/${p.id}`)}
                  className="flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.025]"
                >
                  <Avatar src={p.avatar} name={p.fullName} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11.5px] font-semibold text-vault-text">{p.fullName}</span>
                      <span className="shrink-0 font-mono text-[8px] text-vault-muted">{relativeTime(p.updatedAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[8.5px] text-vault-text2">
                      <FlagIcon iso2={p.countryIso2} className="!h-[8px] !w-[12px]" />
                      <span className="truncate">{p.profileCode} · {p.categoryName}</span>
                    </div>
                  </div>
                </button>
              ))}
              {!data.recentProfiles.length && <div className="px-4 py-10 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-vault-muted">No records yet</div>}
            </div>
          </div>
        </section>

        {/* CENTER - dossier database overview */}
        <section className="xl:col-span-5">
          <div className="vault-panel flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-vault-border-soft px-4 py-3">
              <div>
                <div className="micro-label">02 - Archive</div>
                <h2 className="font-condensed text-lg font-semibold uppercase tracking-[0.12em] text-vault-text">Database Overview</h2>
              </div>
              <span className="chip">{s.totalProfiles} records</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/[0.04]">
              <Distribution title="Country Distribution" icon={<Globe2 size={11} />} rows={data.countryDistribution.map((c) => ({ label: c.country, count: c.count, max: Math.max(...data.countryDistribution.map((x) => x.count), 1), flag: c.iso2 }))} />
              <Distribution title="Category Distribution" icon={<Database size={11} />} rows={data.categoryDistribution.map((c) => ({ label: c.category, count: c.count, max: Math.max(...data.categoryDistribution.map((x) => x.count), 1), color: c.color }))} />
            </div>
            <div className="border-t border-vault-border-soft px-4 py-3">
              <div className="micro-label mb-2 flex items-center gap-2"><Eye size={10} /> Most Frequently Accessed</div>
              <div className="space-y-1">
                {data.mostViewed.slice(0, 5).map((p) => (
                  <button key={p.id} onClick={() => navigate(`/profiles/${p.id}`)} className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]">
                    <span className="font-mono text-[9px] text-vault-red">{p.profileCode}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-vault-text">{p.fullName}</span>
                    <span className="font-mono text-[9px] text-vault-muted">{p.viewCount}×</span>
                  </button>
                ))}
                {!data.mostViewed.length && <div className="px-2 py-3 text-center font-mono text-[9px] text-vault-muted">NO VIEWS RECORDED YET</div>}
              </div>
            </div>
            <div className="mt-auto border-t border-vault-border-soft px-4 py-3">
              <div className="micro-label">Quick Actions</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="vault-btn !px-2.5" onClick={() => navigate('/profiles/new')}><Zap size={11} /> NLP Create</button>
                <button className="vault-btn !px-2.5" onClick={() => navigate('/favorites')}><Star size={11} /> Favorites</button>
                <button className="vault-btn !px-2.5" onClick={() => navigate('/archived')}><Archive size={11} /> Archived</button>
                <button className="vault-btn !px-2.5" onClick={() => navigate('/users')}><Users size={11} /> Users</button>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT - activity feed */}
        <section className="space-y-4 xl:col-span-3">
          <div className="vault-panel flex flex-col">
            <div className="flex items-center justify-between border-b border-vault-border-soft px-4 py-3">
              <div>
                <div className="micro-label">03 - Trace</div>
                <h2 className="font-condensed text-lg font-semibold uppercase tracking-[0.12em] text-vault-text">Live Activity</h2>
              </div>
              <button className="font-mono text-[9px] uppercase tracking-[0.2em] text-vault-red hover:underline" onClick={() => navigate('/activity')}>Logs →</button>
            </div>
            <div className="vault-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {data.latestActivity.map((a) => (
                <div key={a.id} className="border-b border-white/[0.05] px-1 py-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-vault-amber/90">{a.eventType.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-[8px] text-vault-muted">{relativeTime(a.createdAt)}</span>
                  </div>
                  <div className="mt-1 truncate text-[10.5px] leading-snug text-vault-text2">{a.summary}</div>
                </div>
              ))}
              {!data.latestActivity.length && <div className="px-2 py-6 text-center font-mono text-[9px] text-vault-muted">AWAITING FIRST EVENTS</div>}
            </div>
            <div className="border-t border-vault-border-soft px-4 py-2.5">
              <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.2em] text-vault-muted">
                <span>Audit chain</span>
                <span className="flex items-center gap-1.5 text-vault-green"><span className="status-dot bg-vault-green" /> Intact</span>
              </div>
            </div>
          </div>
          <ApiKeysPanel />
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-vault-border-soft px-6 py-3">
        <div className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.25em] text-vault-muted"><FilePlus2 size={10} /> New records appear in the archive instantly</div>
        <button className="group flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-text2 hover:text-vault-text" onClick={() => navigate('/profiles/new')}>
          Open Dossier Forge <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  )
}

function ApiKeysPanel() {
  const [keys, setKeys] = useState<import('@shared/types').ApiKeyListItem[]>([])
  const [open, setOpen] = useState(false)
  const [mcp, setMcp] = useState<{ enabled: boolean; running: boolean; port: number; url: string } | null>(null)
  const [label, setLabel] = useState('')
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setKeys(await call(zeus.apikeys.list()))
    } catch {
      setKeys([])
    }
    try {
      const info = await call(zeus.mcp.getInfo())
      setMcp({ enabled: info.enabled, running: info.running, port: info.port, url: info.url })
    } catch {
      setMcp(null)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  const generate = async () => {
    if (busy) return
    setBusy(true)
    try {
      const generated = await call(zeus.apikeys.generate(label.trim() || undefined))
      setFreshKey(generated.key)
      setLabel('')
      toastOk('API key created', generated.key.slice(0, 12) + '...')
      await load()
    } catch (e) {
      toastError('Generate failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    try {
      await call(zeus.apikeys.revoke(id))
      toastInfo('Key revoked')
      await load()
    } catch (e) {
      toastError('Revoke failed', e instanceof Error ? e.message : undefined)
    }
  }

  const copyToken = async (text: string) => {
    const ok = await copyText(text, 30)
    toastOk(ok ? 'Copied to clipboard' : 'Copy failed')
  }

  return (
    <div className="vault-panel overflow-hidden">
      <button type="button" className="flex w-full items-center justify-between border-b border-vault-border-soft px-4 py-3" onClick={() => setOpen((v) => !v)}>
        <div>
          <div className="micro-label">04 - Access</div>
          <h2 className="font-condensed text-lg font-semibold uppercase tracking-[0.12em] text-vault-text">API Keys</h2>
        </div>
        <ChevronDown size={13} className={`text-vault-muted transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em]">
            <span className="text-vault-text2">MCP endpoint</span>
            <span className={mcp?.running ? 'text-vault-green' : 'text-vault-muted'}>{mcp?.running ? `Listening :${mcp.port}` : mcp?.enabled ? ' enabled, waiting for session' : ' disabled'}</span>
          </div>
          <input
            className="vault-input h-8 w-full px-2 font-mono text-[10px]"
            placeholder="Key label (e.g. claude-code-local)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="vault-btn vault-btn-primary w-full justify-center" onClick={() => void generate()} disabled={busy}>
            <Plus size={12} /> {busy ? 'Creating...' : 'Generate API Key'}
          </button>
          {freshKey && (
            <div className="border border-vault-amber/40 bg-vault-amber/[0.07] p-2.5">
              <div className="micro-label !text-[8px] !text-vault-amber">Fresh key - shown once only</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[9px] text-vault-text" title={freshKey}>{freshKey}</code>
                <button className="vault-btn !px-2 !py-1" onClick={() => void copyToken(freshKey)}><Copy size={11} /></button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-2 border border-white/[0.05] px-2.5 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[10.5px] font-medium text-vault-text">{k.label || 'Unnamed key'}</div>
                  <div className="font-mono text-[8px] text-vault-muted">zv_...{k.hint} · {k.ownerUsername} · {formatTimestamp(k.createdAt, 'military')}</div>
                  <div className="font-mono text-[7.5px] text-vault-muted">last used {k.lastUsedAt ? relativeTime(k.lastUsedAt) : 'never'}</div>
                </div>
                <button className="shrink-0 p-1 text-vault-muted hover:text-vault-red" onClick={() => void revoke(k.id)} aria-label="Revoke key">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {keys.length === 0 && <div className="py-2 text-center font-mono text-[8.5px] uppercase tracking-[0.2em] text-vault-muted">No keys yet</div>}
          </div>
          <p className="font-mono text-[8px] leading-relaxed text-vault-muted">Keys authenticate the MCP server on this machine. Rotate or revoke them here at any time.</p>
        </div>
      )}
    </div>
  )
}

function Distribution({
  title,
  icon,
  rows,
}: {
  title: string
  icon: React.ReactNode
  rows: { label: string; count: number; max: number; flag?: string; color?: string }[]
}) {
  return (
    <div className="bg-[#0C0E11] px-4 py-3">
      <div className="micro-label mb-2 flex items-center gap-2">{icon} {title}</div>
      <div className="space-y-1.5">
        {rows.length === 0 && <div className="font-mono text-[9px] text-vault-muted">NO DATA</div>}
        {rows.slice(0, 6).map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            {r.flag && <FlagIcon iso2={r.flag} className="!h-[9px] !w-[13px]" />}
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            <span className="w-24 truncate text-[10px] text-vault-text2">{r.label}</span>
            <div className="h-[3px] flex-1 bg-white/[0.06]">
              <div className="h-full bg-vault-red/80" style={{ width: `${Math.round((r.count / r.max) * 100)}%` }} />
            </div>
            <span className="w-6 text-right font-mono text-[9px] text-vault-text2">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
