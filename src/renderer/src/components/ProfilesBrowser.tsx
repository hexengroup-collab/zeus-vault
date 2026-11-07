import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSession } from '@/stores/session'
import { ProfileTable, buildDefaultColumns, ColumnToggle, useColumnVisibility } from '@/components/ProfileTable'
import { ConfirmModal } from '@/components/ConfirmModal'
import { toastError, toastOk } from '@/stores/toast'
import type { ProfileFilters } from '@shared/types'
import { COUNTRIES } from '@shared/countries'

export type BrowserView = 'active' | 'archived' | 'favorites' | 'all-status'

export function ProfilesBrowser({
  view,
  allowViewToggle = false,
}: {
  view: BrowserView
  allowViewToggle?: boolean
}) {
  const navigate = useNavigate()
  const { user } = useSession()
  const [searchParams] = useSearchParams()
  const [currentView, setCurrentView] = useState<BrowserView>(view)
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState(() => searchParams.get('country') ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [gender, setGender] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'updatedAt', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false)

  const { data: categories } = useAsync(() => call(zeus.categories.list()), [])
  const { data: users } = useAsync(() => (user?.role === 'admin' ? call(zeus.users.list()) : Promise.resolve([])), [user?.role])

  const filters: ProfileFilters = useMemo(() => ({
    view: currentView,
    search: search.trim() || undefined,
    country: country || undefined,
    categoryId: categoryId || undefined,
    createdBy: createdBy || undefined,
    gender: gender || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sort,
    page,
    pageSize,
  }), [currentView, search, country, categoryId, createdBy, gender, createdFrom, createdTo, sort, page, pageSize])

  const { data, loading, reload } = useAsync(() => call(zeus.profiles.list(filters)), [JSON.stringify(filters)])
  const { hidden, toggle, isHidden } = useColumnVisibility(buildDefaultColumns().map((c) => c.id))
  const dateStyle = ('utc' as const)

  const allColumns = useMemo(() => buildDefaultColumns(dateStyle), [dateStyle])
  const columns = useMemo(() => allColumns.filter((c) => !isHidden(c.id)), [allColumns, isHidden])

  useEffect(() => {
    setPage(1)
    setSelected(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, country, categoryId, createdBy, gender, createdFrom, createdTo, currentView])

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))
  }

  const bulk = async (action: 'archive' | 'delete' | 'export', ids: string[]) => {
    if (action === 'export') {
      try {
        const picked = await call(zeus.importexport.pickSave({ format: 'csv', defaultName: `zeus-vault-selection-${ids.length}.csv` }))
        if (!picked) return
        const result = await call(zeus.importexport.exportProfiles({ ids, format: 'csv', includeSensitive: false, targetPath: picked.filePath }))
        toastOk(`Exported ${result.count} profile(s)`, result.filePath)
      } catch (e) {
        toastError('Export failed', e instanceof Error ? e.message : undefined)
      }
      return
    }
    const fn = action === 'archive' ? zeus.profiles.archive : zeus.profiles.remove
    const settled = await Promise.allSettled(ids.map((id) => call(fn(id))))
    const failed = settled.filter((r) => r.status === 'rejected').length
    toastOk(action === 'archive' ? 'Bulk archive complete' : 'Bulk delete complete', failed ? `${failed} record(s) failed` : `${ids.length} record(s) processed`)
    setSelected(new Set())
    reload()
  }

  const hasFilters = !!(search || country || categoryId || createdBy || gender || createdFrom || createdTo)
  const resetFilters = () => {
    setSearch(''); setCountry(''); setCategoryId(''); setCreatedBy(''); setGender(''); setCreatedFrom(''); setCreatedTo('')
  }

  const showFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const showTo = Math.min(total, page * pageSize)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter bar */}
      <div className="border-b border-vault-border-soft px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 items-center gap-2 border border-white/10 bg-[#0D0F12] px-2.5">
            <Filter size={12} className="text-vault-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username, email, phone, ID, tags…"
              className="h-9 w-full bg-transparent text-[11px] text-vault-text outline-none placeholder:text-vault-muted"
              aria-label="Filter profiles"
            />
            {search && <button onClick={() => setSearch('')} aria-label="Clear search" className="text-vault-muted hover:text-vault-text"><X size={12} /></button>}
          </div>

          {allowViewToggle && (
            <div className="flex border border-white/10">
              {(['active', 'archived', 'all-status'] as const).map((v) => (
                <button key={v} onClick={() => setCurrentView(v)} className={`px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${currentView === v ? 'bg-vault-red/90 text-[#0D0507]' : 'text-vault-text2 hover:text-vault-text'}`}>
                  {v === 'all-status' ? 'All' : v}
                </button>
              ))}
            </div>
          )}

          <select className="vault-select h-9 px-2 text-[11px]" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">All countries</option>
            {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
          </select>

          <select className="vault-select h-9 px-2 text-[11px]" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {user?.role === 'admin' && (
            <select className="vault-select h-9 px-2 text-[11px]" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} aria-label="Created by">
              <option value="">All creators</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.username}>{u.username}</option>)}
            </select>
          )}

          <select className="vault-select h-9 px-2 text-[11px]" value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Gender">
            <option value="">All genders</option>
            {['Male', 'Female', 'Non-binary', 'Prefer not to say', 'Unknown'].map((g) => <option key={g}>{g}</option>)}
          </select>

          <input type="date" className="vault-input h-9 px-2 text-[10px] text-vault-text2" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} aria-label="Created from" title="Created from" />
          <input type="date" className="vault-input h-9 px-2 text-[10px] text-vault-text2" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} aria-label="Created to" title="Created to" />

          {hasFilters && (
            <button className="vault-btn vault-btn-ghost !px-2" onClick={resetFilters} title="Reset filters" aria-label="Reset filters">
              <RotateCcw size={12} />
            </button>
          )}
          <ColumnToggle all={allColumns} hidden={hidden} toggle={toggle} />
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-vault-amber/30 bg-vault-amber/[0.06] px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-amber">{selected.size} selected</span>
          <button className="vault-btn !py-1.5" onClick={() => setConfirmBulkArchive(true)}><Archive size={11} /> Archive</button>
          <button className="vault-btn !py-1.5" onClick={() => void bulk('export', [...selected])}><Download size={11} /> Export CSV</button>
          <button className="vault-btn vault-btn-danger !py-1.5" onClick={() => setConfirmBulkDelete(true)}><Trash2 size={11} /> Delete</button>
          <button className="vault-btn vault-btn-ghost !py-1.5 ml-auto" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="vault-scroll min-h-0 flex-1 overflow-auto">
        <ProfileTable
          rows={rows}
          columns={columns}
          sort={sort}
          onSort={(key) => setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))}
          onOpen={(id) => navigate(`/profiles/${id}`)}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
        />
        {loading && <div className="p-6 text-center font-mono text-[9px] uppercase tracking-[0.35em] text-vault-muted">Scanning archive…</div>}
      </div>

      {/* Pagination */}
      <div className="flex shrink-0 items-center gap-3 border-t border-vault-border-soft px-4 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">
        <span>Showing <span className="text-vault-text">{showFrom} - {showTo}</span> of <span className="text-vault-text">{total}</span></span>
        <div className="ml-auto flex items-center gap-2">
          <select className="vault-select h-7 px-1.5 text-[9px]" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} aria-label="Rows per page">
            {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button className="vault-btn vault-btn-ghost !h-7 !w-7 !px-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft size={12} /></button>
          <span className="tabular-nums">{page} / {pageCount}</span>
          <button className="vault-btn vault-btn-ghost !h-7 !w-7 !px-0" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label="Next page"><ChevronRight size={12} /></button>
        </div>
      </div>

      <ConfirmModal
        open={confirmBulkArchive}
        onClose={() => setConfirmBulkArchive(false)}
        title="Archive selected records"
        message={`${selected.size} profile(s) will be moved to the archive. They remain searchable in Archived Profiles and can be restored at any time.`}
        confirmLabel="Archive"
        danger={false}
        onConfirm={() => bulk('archive', [...selected])}
      />
      <ConfirmModal
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        title="Delete selected records"
        message={`${selected.size} profile(s) will be soft-deleted (recoverable from backup only). Every deletion is written to the hash-chained audit log.`}
        confirmLabel="Delete"
        onConfirm={() => bulk('delete', [...selected])}
      />
    </div>
  )
}

export function FavoritesBrowser() {
  return <ProfilesBrowser view="favorites" />
}

export function ArchivedBrowser() {
  return <ProfilesBrowser view="archived" />
}

export function ProfilesPage() {
  return <ProfilesBrowser view="active" allowViewToggle />
}
