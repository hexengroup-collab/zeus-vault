import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Lock, Plus, Search, X } from 'lucide-react'
import { useSession } from '@/stores/session'
import { Avatar } from './Avatar'
import { call, zeus } from '@/lib/api'
import { formatTimestamp } from '@shared/time'
import type { AuditEntry } from '@shared/types'
import { ROLE_LABELS } from '@shared/constants'

function StatusChip({ label, state }: { label: string; state: 'ok' | 'warn' | 'bad' }) {
  const dot = state === 'ok' ? 'bg-vault-green' : state === 'warn' ? 'bg-vault-amber' : 'bg-vault-red'
  const text = state === 'ok' ? 'text-vault-text2' : state === 'warn' ? 'text-vault-amber' : 'text-vault-red'
  return (
    <span className="hidden items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.22em] lg:inline-flex" title={`${label}: ${state === 'ok' ? 'online' : state}`}>
      <span className={`status-dot ${dot} pulse-dot`} />
      <span className="text-vault-muted">{label}</span>
      <span className={text}>{state === 'ok' ? 'ONLINE' : state === 'warn' ? 'DEGRADED' : 'OFFLINE'}</span>
    </span>
  )
}

export function TopBar({ section }: { section: string }) {
  const navigate = useNavigate()
  const { user, sessionRef } = useSession()
  const [q, setQ] = useState('')
  const [bellOpen, setBellOpen] = useState(false)
  const [recent, setRecent] = useState<AuditEntry[] | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        navigate('/profiles/new')
      } else if (mod && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        void lockVault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!bellOpen) return
    void call(zeus.audit.list({ page: 1, pageSize: 6 }))
      .then((r) => setRecent(r.rows))
      .catch(() => setRecent([]))
  }, [bellOpen])

  const lockVault = async () => {
    try {
      await call(zeus.session.lock())
      useSession.getState().setLocked()
    } catch {
      /* already locked */
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const query = q.trim()
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  const sessionOk = !!sessionRef

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-stretch border-b border-vault-border-soft bg-[#0C0E11]/95 backdrop-blur-sm">
      <form onSubmit={submit} className="flex w-72 items-center gap-2 border-r border-vault-border-soft px-3 xl:w-96">
        <Search size={13} className="shrink-0 text-vault-muted" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search dossiers, fields, countries…  (CTRL K)"
          className="h-full w-full bg-transparent font-mono text-[11px] text-vault-text outline-none placeholder:text-vault-muted"
          aria-label="Global search"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} className="text-vault-muted hover:text-vault-text" aria-label="Clear">
            <X size={12} />
          </button>
        )}
      </form>

      <div className="flex items-center gap-3 px-3 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-muted">
        <span className="hidden text-[10px] text-vault-text2 md:inline">{section}</span>
      </div>

      <div className="ml-auto flex items-center gap-3 pr-3">
        <div className="hidden items-center gap-3 border-r border-vault-border-soft pr-3 xl:flex">
          <StatusChip label="Database" state="ok" />
          <StatusChip label="Storage" state="ok" />
          <StatusChip label="Encryption" state="ok" />
          <StatusChip label="Session" state={sessionOk ? 'ok' : 'warn'} />
          <StatusChip label="System" state="ok" />
        </div>

        <button className="vault-btn vault-btn-primary !px-2.5 !py-1.5" onClick={() => navigate('/profiles/new')} title="New dossier (ALT N)">
          <Plus size={12} strokeWidth={2.5} />
          <span className="hidden sm:inline">New</span>
        </button>

        <div className="relative" ref={bellRef}>
          <button className="vault-btn vault-btn-ghost !px-2" onClick={() => setBellOpen((v) => !v)} aria-label="Notifications">
            <Bell size={14} strokeWidth={1.6} />
            <span className="status-dot bg-vault-red pulse-dot" />
          </button>
          {bellOpen && (
            <div className="vault-panel absolute right-0 top-full z-30 mt-2 w-80 p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="micro-label">Latest Activity</span>
                <button className="font-mono text-[9px] uppercase tracking-[0.2em] text-vault-red hover:underline" onClick={() => { setBellOpen(false); navigate('/activity') }}>
                  View all
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto vault-scroll">
                {recent === null && <div className="px-3 py-4 text-center font-mono text-[10px] text-vault-muted">LOADING…</div>}
                {recent?.length === 0 && <div className="px-3 py-4 text-center font-mono text-[10px] text-vault-muted">NO RECENT ACTIVITY</div>}
                {recent?.map((r) => (
                  <div key={r.id} className="border-t border-white/[0.05] px-2 py-2">
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-vault-text2">{r.eventType.replace(/_/g, ' ')}</div>
                    <div className="mt-0.5 truncate text-[11px] text-vault-text">{r.targetLabel ?? r.detail ?? ' - '}</div>
                    <div className="mt-0.5 font-mono text-[8.5px] text-vault-muted">{formatTimestamp(r.createdAt)} · {r.actorUsername}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button className="vault-btn vault-btn-ghost !px-2" onClick={() => void lockVault()} title="Lock vault (CTRL SHIFT L)" aria-label="Lock vault">
          <Lock size={14} strokeWidth={1.6} />
        </button>

        <button className="flex items-center gap-2 border-l border-vault-border-soft pl-3 text-left" onClick={() => navigate('/account')} aria-label="My account">
          <Avatar src={user?.avatar} name={user?.fullName ?? 'User'} size={26} />
          <span className="hidden leading-tight md:block">
            <span className="block max-w-[110px] truncate text-[10.5px] font-semibold text-vault-text">{user?.username}</span>
            <span className="block font-mono text-[8px] uppercase tracking-[0.16em] text-vault-muted">{user ? ROLE_LABELS[user.role] : ''}</span>
          </span>
        </button>
      </div>
    </header>
  )
}
