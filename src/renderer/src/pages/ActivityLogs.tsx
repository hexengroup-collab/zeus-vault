import { useState } from 'react'
import { ChevronLeft, ChevronRight, Search, ShieldCheck, ShieldAlert, X } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { EVENT_LABELS } from '@shared/constants'
import { formatTimestamp, relativeTime } from '@shared/time'
import { toastOk, toastError } from '@/stores/toast'
import { useSession } from '@/stores/session'

const CATEGORIES = [
  { id: 'all', label: 'All Events' },
  { id: 'PROFILE', label: 'Profile Ops' },
  { id: 'IDENTITY', label: 'Identity & Session' },
  { id: 'SYSTEM', label: 'System' },
] as const

export function ActivityLogs() {
  const { user } = useSession()
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [verifying, setVerifying] = useState(false)
  const pageSize = 50

  const { data, loading } = useAsync(
    () =>
      call(zeus.audit.list({
        page,
        pageSize,
        category: category === 'all' ? undefined : (category as 'PROFILE' | 'IDENTITY' | 'SYSTEM'),
        search: search.trim() || undefined,
      })),
    [page, category, search],
  )

  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const verifyChain = async () => {
    setVerifying(true)
    try {
      const result = await call(zeus.audit.verify())
      if (result.ok) toastOk('AUDIT CHAIN INTACT', `${result.checked} entries hash-verified`)
      else toastError('CHAIN BROKEN', `First broken entry: ${result.brokenAt}`)
    } catch (e) {
      toastError('Verification failed', e instanceof Error ? e.message : undefined)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-vault-border-soft px-4 py-3">
        <div>
          <div className="micro-label">Chain of Custody</div>
          <h1 className="font-condensed text-2xl font-semibold leading-none tracking-wide text-vault-text">ACTIVITY LOGS</h1>
        </div>
        <div className="ml-2 flex border border-white/10">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => { setCategory(c.id); setPage(1) }} className={`px-3 py-2 font-mono text-[8.5px] uppercase tracking-[0.2em] transition-colors ${category === c.id ? 'bg-vault-red/90 text-[#0D0507]' : 'text-vault-text2 hover:text-vault-text'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-52 flex-1 items-center gap-2 border border-white/10 bg-[#0D0F12] px-2.5">
          <Search size={12} className="text-vault-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search actor, target, field, detail…" className="h-9 w-full bg-transparent text-[11px] outline-none placeholder:text-vault-muted" aria-label="Search logs" />
          {search && <button onClick={() => setSearch('')} aria-label="Clear"><X size={12} className="text-vault-muted hover:text-vault-text" /></button>}
        </div>
        <button className="vault-btn" onClick={() => void verifyChain()} disabled={verifying}>
          {verifying ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />} {verifying ? 'Verifying…' : 'Verify Chain'}
        </button>
      </div>

      <div className="vault-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#0E1013]">
            <tr className="border-b border-vault-border">
              {['Timestamp (UTC)', 'Event', 'Actor', 'Target', 'Field / Detail'].map((h) => (
                <th key={h} className="px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-vault-text2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id} className="row-alt border-b border-white/[0.045] align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="font-mono text-[9px] text-vault-text2">{formatTimestamp(r.createdAt)}</div>
                  <div className="font-mono text-[8px] text-vault-muted">{formatTimestamp(r.createdAt, 'military')} · {relativeTime(r.createdAt)}</div>
                </td>
                <td className="px-3 py-2"><span className="chip !border-vault-amber/30 !text-vault-amber/90">{EVENT_LABELS[r.eventType] ?? r.eventType.replace(/_/g, ' ')}</span></td>
                <td className="px-3 py-2 font-mono text-[9.5px] text-vault-text2">{r.actorUsername}</td>
                <td className="max-w-44 truncate px-3 py-2 text-[10.5px] text-vault-text2" title={r.targetLabel ?? ''}>{r.targetLabel ?? r.targetId ?? ' - '}</td>
                <td className="max-w-md px-3 py-2">
                  <div className="truncate font-mono text-[9px] text-vault-muted" title={r.detail ?? r.field ?? ''}>
                    {r.field && <span className="text-vault-text2">{r.field} · </span>}
                    {r.detail ?? ''}
                    {r.oldValue && <span className="text-vault-red/70"> −{truncate(r.oldValue)}</span>}
                    {r.newValue && <span className="text-vault-green/80"> +{truncate(r.newValue)}</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && data && data.rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-vault-muted">No audit events match</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-6 text-center font-mono text-[9px] uppercase tracking-[0.35em] text-vault-muted">Reading chain…</div>}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-vault-border-soft px-4 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">
        <span>{user?.role === 'admin' ? `${total} total events · full ledger` : `${total} events · your activity only`}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="vault-btn vault-btn-ghost !h-7 !w-7 !px-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous"><ChevronLeft size={12} /></button>
          <span className="tabular-nums">{page} / {pageCount}</span>
          <button className="vault-btn vault-btn-ghost !h-7 !w-7 !px-0" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next"><ChevronRight size={12} /></button>
        </div>
      </div>
    </div>
  )
}

function truncate(v: string): string {
  return v.length > 60 ? `${v.slice(0, 60)}…` : v
}
