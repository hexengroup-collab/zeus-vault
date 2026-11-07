import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { call, zeus, ApiFailure } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { Modal } from '@/components/Modal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { FieldRow } from '@/components/FieldRow'
import { FlagIcon } from '@/components/FlagIcon'
import { toastError, toastInfo, toastOk } from '@/stores/toast'
import { COUNTRIES } from '@shared/countries'
import { formatTimestamp } from '@shared/time'
import type { B2bContact, B2bInput, B2bStatus } from '@shared/types'

const DEFAULT_INDUSTRIES = [
  'Technology', 'Finance', 'Logistics', 'Healthcare', 'Energy', 'Agriculture', 'Manufacturing',
  'Retail', 'Telecommunications', 'Construction', 'Hospitality', 'Education', 'Government',
  'Defense', 'Mining', 'Textiles', 'Maritime', 'Aviation',
]
const STATUSES: B2bStatus[] = ['Lead', 'Active', 'Dormant']

const emptyInput = (): B2bInput => ({
  companyName: '', industry: '', website: '', workType: '',
  contactPerson: '', contactRole: '', phone: '', email: '',
  street: '', city: '', state: '', postalCode: '', country: '', countryIso2: '',
  status: 'Lead', notes: '', tags: [],
})

const inputClass = (error: boolean) =>
  `h-9 w-full rounded-[3px] border px-2.5 text-[12px] outline-none transition-shadow placeholder:text-vault-muted focus:border-vault-red/60 focus:shadow-[0_0_0_3px_rgba(227,75,100,0.12)] ${error ? 'border-vault-red/60 bg-vault-red/[0.05]' : 'border-white/10 bg-[#0D0F12]'} text-vault-text`

export function B2bContacts() {
  const [search, setSearch] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState<'all' | B2bStatus>('all')
  const [country, setCountry] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 25
  const [selected, setSelected] = useState<B2bContact | null>(null)
  const [editing, setEditing] = useState<B2bContact | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<B2bContact | null>(null)

  const { data: industries } = useAsync(() => call(zeus.b2b.industries()), [])
  const query = useMemo(() => ({
    search: search.trim() || undefined,
    industry: industry || undefined,
    status,
    country: country || undefined,
    favoritesOnly,
    page,
    pageSize,
    sort: { key: 'updatedAt' as const, dir: 'desc' as const },
  }), [search, industry, status, country, favoritesOnly, page])

  const { data, loading, reload } = useAsync(() => call(zeus.b2b.list(query)), [JSON.stringify(query)])

  useEffect(() => { setPage(1) }, [search, industry, status, country, favoritesOnly])

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const activeCount = rows.filter((r) => r.status === 'Active').length
  const leadCount = rows.filter((r) => r.status === 'Lead').length
  const dormantCount = rows.filter((r) => r.status === 'Dormant').length

  const industryOptions = [...new Set([...DEFAULT_INDUSTRIES, ...(industries ?? [])])].sort()

  const toggleFavorite = async (c: B2bContact) => {
    try {
      const updated = await call(zeus.b2b.setFavorite({ id: c.id, favorite: !c.isFavorite }))
      setSelected((s) => (s?.id === c.id ? updated : s))
      toastInfo(updated.isFavorite ? 'Marked favorite' : 'Unmarked', updated.companyName)
      reload()
    } catch (e) {
      toastError('Update failed', e instanceof Error ? e.message : undefined)
    }
  }

  const exportCsv = async () => {
    try {
      const picked = await call(zeus.importexport.pickSave({ format: 'csv', defaultName: 'zeus-vault-b2b.csv' }))
      if (!picked) return
      const result = await call(zeus.b2b.exportCsv({ ...query, targetPath: picked.filePath }))
      toastOk('B2B export complete', `${result.count} contact(s) -> ${result.filePath}`)
    } catch (e) {
      toastError('Export failed', e instanceof Error ? e.message : undefined)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-vault-border-soft px-5 pb-4 pt-5">
        <div>
          <div className="micro-label flex items-center gap-2"><Building2 size={10} /> Business Contact Book</div>
          <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">B2B CONTACTS</h1>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">{total} companies tracked - {activeCount} active on this page, {leadCount} leads, {dormantCount} dormant</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="vault-btn" onClick={() => void exportCsv()}><Download size={12} /> Export CSV</button>
          <button className="vault-btn vault-btn-primary" onClick={() => setEditing('new')}><Plus size={12} /> New Contact</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-vault-border-soft px-4 py-2.5">
        <div className="flex min-w-52 flex-1 items-center gap-2 border border-white/10 bg-[#0D0F12] px-2.5">
          <Search size={12} className="text-vault-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact, industry, work type, email, phone..." className="h-9 w-full bg-transparent text-[11px] outline-none placeholder:text-vault-muted" aria-label="Search B2B contacts" />
          {search && <button onClick={() => setSearch('')} aria-label="Clear"><X size={12} className="text-vault-muted hover:text-vault-text" /></button>}
        </div>
        <input list="b2b-industries" className="vault-input h-9 w-48 px-2 text-[11px]" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry..." aria-label="Industry" />
        <datalist id="b2b-industries">{industryOptions.map((i) => <option key={i} value={i} />)}</datalist>
        <select className="vault-select h-9 px-2 text-[11px]" value={status} onChange={(e) => setStatus(e.target.value as 'all' | B2bStatus)} aria-label="Status">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="vault-select h-9 px-2 text-[11px]" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
        </select>
        <button className={`vault-btn !px-2.5 ${favoritesOnly ? '!border-vault-amber/50 !bg-vault-amber/10 !text-vault-amber' : ''}`} onClick={() => setFavoritesOnly((v) => !v)} aria-pressed={favoritesOnly} aria-label="Show favorites only">
          <Star size={12} className={favoritesOnly ? 'fill-vault-amber' : ''} />
        </button>
        {(search || industry || status !== 'all' || country || favoritesOnly) && <button className="vault-btn vault-btn-ghost !px-2" onClick={() => { setSearch(''); setIndustry(''); setStatus('all'); setCountry(''); setFavoritesOnly(false) }} aria-label="Clear filters"><X size={12} /></button>}
      </div>

      {/* Status strip */}
      <div className="flex divide-x divide-white/[0.06] border-b border-vault-border-soft">
        {STATUSES.map((s) => (
          <div key={s} className="flex-1 px-4 py-2">
            <div className="micro-label">{s}</div>
            <div className="font-condensed text-2xl font-semibold leading-none text-vault-text">{rows.filter((r) => r.status === s).length}<span className="ml-1 font-sans text-[10px] font-normal text-vault-muted">on page</span></div>
          </div>
        ))}
        <div className="flex-1 px-4 py-2">
          <div className="micro-label">Total (filters)</div>
          <div className="font-condensed text-2xl font-semibold leading-none text-vault-red">{total}</div>
        </div>
      </div>

      {/* Table */}
      <div className="vault-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#0E1013]">
            <tr className="border-b border-vault-border">
              {['B2B ID', 'Company', 'Industry', 'Type of Work They Need', 'Contact', 'Phone', 'Email', 'Status', ''].map((h) => <th key={h} className="px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-vault-text2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => setSelected(c)} className="row-alt table-row-hover cursor-pointer border-b border-white/[0.045]">
                <td className="px-3 py-2 font-mono text-[9px] text-vault-red">{c.b2bCode}</td>
                <td className="max-w-52 px-3 py-2">
                  <div className="flex items-center gap-1.5"><span className="truncate text-[11px] font-semibold text-vault-text">{c.companyName}</span>{c.isFavorite && <Star size={10} className="shrink-0 fill-vault-amber text-vault-amber" />}{c.isDemo && <span className="chip !border-vault-amber/40 !px-1 !text-[7px] !text-vault-amber">DEMO</span>}</div>
                  <div className="truncate font-mono text-[8px] text-vault-muted">{c.website || ' - '}</div>
                </td>
                <td className="px-3 py-2 text-[10px] text-vault-text2">{c.industry || '-'}</td>
                <td className="max-w-48 truncate px-3 py-2 text-[10px] text-vault-text2" title={c.workType}>{c.workType || '-'}</td>
                <td className="px-3 py-2"><div className="text-[10px] text-vault-text2">{c.contactPerson || '-'}</div>{c.contactRole && <div className="font-mono text-[7.5px] uppercase tracking-[0.15em] text-vault-muted">{c.contactRole}</div>}</td>
                <td className="px-3 py-2 font-mono text-[9px] text-vault-text2">{c.phone || '-'}</td>
                <td className="max-w-44 truncate px-3 py-2 font-mono text-[9px] text-vault-text2" title={c.email}>{c.email || '-'}</td>
                <td className="px-3 py-2"><span className={`chip ${c.status === 'Active' ? '!border-vault-green/40 !text-vault-green' : c.status === 'Lead' ? '!border-vault-amber/40 !text-vault-amber' : '!border-vault-text2/30 !text-vault-text2'}`}>{c.status}</span></td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <button className="p-1.5 text-vault-muted hover:text-vault-text" onClick={() => setEditing(c)} aria-label="Edit"><Pencil size={12} /></button>
                  <button className="p-1.5 text-vault-muted hover:text-vault-red" onClick={() => setDeleteTarget(c)} aria-label="Delete"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-14 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-vault-muted">No B2B contacts match</td></tr>}
            {loading && <tr><td colSpan={9} className="px-4 py-14 text-center font-mono text-[9px] uppercase tracking-[0.35em] text-vault-muted">Scanning contact book...</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="flex shrink-0 items-center gap-3 border-t border-vault-border-soft px-4 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">
        <span>{total} record{total === 1 ? '' : 's'}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="vault-btn vault-btn-ghost !h-7 !w-7 !px-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous"><ChevronLeft size={12} /></button>
          <span className="tabular-nums">{page} / {pageCount}</span>
          <button className="vault-btn vault-btn-ghost !h-7 !w-7 !px-0" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next"><ChevronRight size={12} /></button>
        </div>
      </div>

      {/* Detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.companyName ?? ''} subtitle={selected ? `${selected.b2bCode} - ${selected.industry || 'Unspecified'}` : undefined} width="max-w-2xl">
        {selected && (
          <div>
            <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
              <div className="flex h-12 w-12 items-center justify-center border border-vault-red/40 bg-vault-red/10 font-condensed text-2xl font-bold text-vault-red">{selected.companyName.trim().charAt(0).toUpperCase()}</div>
              <div className="min-w-0">
                <div className="truncate font-condensed text-2xl font-semibold leading-none text-vault-text">{selected.companyName}</div>
                <div className="mt-1 flex items-center gap-2"><FlagIcon iso2={selected.countryIso2} /><span className="text-[10px] text-vault-text2">{selected.country || 'Unknown'}</span></div>
              </div>
              <button className="ml-auto" onClick={() => void toggleFavorite(selected)} aria-label="Toggle favorite"><Star size={18} className={selected.isFavorite ? 'fill-vault-amber text-vault-amber' : 'text-vault-muted'} /></button>
            </div>
            <dl className="mt-2">
              <FieldRow label="B2B ID" value={selected.b2bCode} />
              <FieldRow label="Industry" value={selected.industry} />
              <FieldRow label="Website" value={selected.website} />
              <FieldRow label="Type of Work Needed" value={selected.workType} />
              <FieldRow label="Contact Person" value={selected.contactPerson} />
              <FieldRow label="Contact Role" value={selected.contactRole} />
              <FieldRow label="Phone" value={selected.phone} />
              <FieldRow label="Email" value={selected.email} />
              <FieldRow label="Address" value={[selected.street, selected.city, selected.state, selected.postalCode, selected.country].filter(Boolean).join(', ')} />
              <FieldRow label="Status" value={selected.status} />
              <FieldRow label="Tags" value={selected.tags.join(', ')} />
              <FieldRow label="Notes" value={selected.notes} />
              <FieldRow label="Created By" value={`${selected.createdByUsername} - ${formatTimestamp(selected.createdAt)}`} copyValue={`${selected.createdByUsername} @ ${selected.createdAt}`} />
              <FieldRow label="Last Updated" value={formatTimestamp(selected.updatedAt)} />
            </dl>
            <div className="mt-4 flex justify-end gap-2">
              <button className="vault-btn vault-btn-ghost" onClick={() => { setEditing(selected); setSelected(null) }}><Pencil size={12} /> Edit</button>
              <button className="vault-btn vault-btn-danger" onClick={() => { setDeleteTarget(selected); setSelected(null) }}><Trash2 size={12} /> Delete</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / edit modal */}
      <B2bFormModal
        target={editing}
        industries={industryOptions}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload() }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete B2B contact"
        message={`${deleteTarget?.companyName ?? ''} will be soft-deleted and removed from the contact book. A B2B_CONTACT_DELETED event is written to the audit ledger.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await call(zeus.b2b.remove(deleteTarget.id))
            toastOk('Contact deleted', deleteTarget.companyName)
            setDeleteTarget(null)
            reload()
          } catch (e) {
            toastError('Delete failed', e instanceof Error ? e.message : undefined)
          }
        }}
      />
    </div>
  )
}

function B2bFormModal({ target, industries, onClose, onSaved }: { target: B2bContact | 'new' | null; industries: string[]; onClose: () => void; onSaved: () => void }) {
  const editing = target && target !== 'new' ? target : null
  const [input, setInput] = useState<B2bInput>(emptyInput)
  const [initializedFor, setInitializedFor] = useState<string | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([])

  const targetKey = target === 'new' ? 'new' : target?.id ?? null
  if (target && targetKey !== initializedFor) {
    setInitializedFor(targetKey)
    setErrors([])
    setInput(editing ? {
      companyName: editing.companyName, industry: editing.industry, website: editing.website, workType: editing.workType,
      contactPerson: editing.contactPerson, contactRole: editing.contactRole, phone: editing.phone, email: editing.email,
      street: editing.street, city: editing.city, state: editing.state, postalCode: editing.postalCode,
      country: editing.country, countryIso2: editing.countryIso2, status: editing.status, notes: editing.notes, tags: [...editing.tags],
    } : emptyInput())
  }

  const set = (patch: Partial<B2bInput>) => setInput((s) => ({ ...s, ...patch }))
  const errFor = (field: string) => errors.find((f) => f.field === field)?.message

  const onCountry = (iso2: string) => {
    const c = COUNTRIES.find((x) => x.iso2 === iso2)
    if (!c) { set({ country: '', countryIso2: '' }); return }
    set({ country: c.name, countryIso2: c.iso2 })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErrors([])
    try {
      if (editing) {
        const updated = await call(zeus.b2b.update({ id: editing.id, input }))
        toastOk('Contact updated', updated.companyName)
      } else {
        const created = await call(zeus.b2b.create(input))
        toastOk('Contact created', created.b2bCode)
      }
      onSaved()
    } catch (e) {
      if (e instanceof ApiFailure) {
        setErrors(e.fields ?? [])
        toastError('Validation failed', e.message)
      } else {
        toastError('Save failed', e instanceof Error ? e.message : undefined)
      }
    } finally {
      setBusy(false)
    }
  }

  const fieldClass = (f: string) => inputClass(!!errFor(f))
  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit B2B Contact' : 'New B2B Contact'} subtitle="Business contact book" width="max-w-2xl">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {errors.length > 0 && (
          <div role="alert" className="border border-vault-red/40 bg-vault-red/[0.08] px-3 py-2 md:col-span-2">
            <ul className="list-inside list-disc font-mono text-[9px] text-vault-red">{errors.map((f) => <li key={f.field}>{f.message}</li>)}</ul>
          </div>
        )}
        <label className="md:col-span-2">
          <span className="micro-label mb-1 block">Company Name *</span>
          <input autoFocus className={fieldClass('companyName')} value={input.companyName} onChange={(e) => set({ companyName: e.target.value })} placeholder="Northwind Traders Ltd" />
        </label>
        <label>
          <span className="micro-label mb-1 block">Industry</span>
          <input list="b2b-form-industries" className={inputClass(false)} value={input.industry} onChange={(e) => set({ industry: e.target.value })} placeholder="Technology" />
          <datalist id="b2b-form-industries">{industries.map((i) => <option key={i} value={i} />)}</datalist>
          {errFor('industry') && <span className="mt-1 block font-mono text-[8.5px] uppercase text-vault-red">{errFor('industry')}</span>}
        </label>
        <label>
          <span className="micro-label mb-1 block">Website</span>
          <input className={`${fieldClass('website')} font-mono`} value={input.website} onChange={(e) => set({ website: e.target.value })} placeholder="www.company.com" />
          {errFor('website') && <span className="mt-1 block font-mono text-[8.5px] uppercase text-vault-red">{errFor('website')}</span>}
        </label>
        <label className="md:col-span-2">
          <span className="micro-label mb-1 block">Type of Work They Need</span>
          <textarea className="vault-textarea h-16 w-full resize-none px-2.5 py-2 text-[11px]" value={input.workType} onChange={(e) => set({ workType: e.target.value })} placeholder="Website redesign, SEO retainer, customs brokerage, cold chain..." />
        </label>
        <label>
          <span className="micro-label mb-1 block">Contact Person</span>
          <input className={inputClass(false)} value={input.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} placeholder="Dana Whitmore" />
        </label>
        <label>
          <span className="micro-label mb-1 block">Contact Role</span>
          <input className={inputClass(false)} value={input.contactRole} onChange={(e) => set({ contactRole: e.target.value })} placeholder="Head of Procurement" />
        </label>
        <label>
          <span className="micro-label mb-1 block">Phone</span>
          <input className={`${fieldClass('phone')} font-mono`} value={input.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+1 202-555-0147" />
          {errFor('phone') && <span className="mt-1 block font-mono text-[8.5px] uppercase text-vault-red">{errFor('phone')}</span>}
        </label>
        <label>
          <span className="micro-label mb-1 block">Email</span>
          <input className={`${fieldClass('email')} font-mono`} value={input.email} onChange={(e) => set({ email: e.target.value })} placeholder="contact@company.com" />
          {errFor('email') && <span className="mt-1 block font-mono text-[8.5px] uppercase text-vault-red">{errFor('email')}</span>}
        </label>
        <label className="md:col-span-2">
          <span className="micro-label mb-1 block">Street</span>
          <input className={inputClass(false)} value={input.street} onChange={(e) => set({ street: e.target.value })} placeholder="12 Harbor Plaza" />
        </label>
        <label>
          <span className="micro-label mb-1 block">City</span>
          <input className={inputClass(false)} value={input.city} onChange={(e) => set({ city: e.target.value })} placeholder="Newark" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="micro-label mb-1 block">State</span>
            <input className={inputClass(false)} value={input.state} onChange={(e) => set({ state: e.target.value })} placeholder="New Jersey" />
          </label>
          <label>
            <span className="micro-label mb-1 block">Postal Code</span>
            <input className={`${inputClass(false)} font-mono`} value={input.postalCode} onChange={(e) => set({ postalCode: e.target.value })} placeholder="07102" />
          </label>
        </div>
        <label className="md:col-span-2">
          <span className="micro-label mb-1 block">Country</span>
          <select className={inputClass(false)} value={input.countryIso2} onChange={(e) => onCountry(e.target.value)}>
            <option value="">Select country...</option>
            {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span className="micro-label mb-1 block">Tracking Status</span>
          <select className={inputClass(false)} value={input.status} onChange={(e) => set({ status: e.target.value as B2bStatus })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span className="micro-label mb-1 block">Tags (comma separated)</span>
          <input className={`${inputClass(false)} font-mono`} value={input.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="cold-chain, priority, tender" />
        </label>
        <label className="md:col-span-2">
          <span className="micro-label mb-1 block">Notes</span>
          <textarea className="vault-textarea h-14 w-full resize-none px-2.5 py-2 text-[11px]" value={input.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Context, last conversation, next step..." />
        </label>
        <div className="flex justify-end gap-2 pt-1 md:col-span-2">
          <button type="button" className="vault-btn vault-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="vault-btn vault-btn-primary" disabled={busy || !input.companyName.trim()}>{busy ? 'Saving...' : editing ? 'Save Changes' : 'Create Contact'}</button>
        </div>
      </form>
    </Modal>
  )
}
