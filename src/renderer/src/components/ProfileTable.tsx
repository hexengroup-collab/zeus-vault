import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Star } from 'lucide-react'
import type { ProfileListItem } from '@shared/types'
import { Avatar } from './Avatar'
import { FlagIcon } from './FlagIcon'
import { formatTimestamp } from '@shared/time'
import { defaultAvatar } from '@/lib/format'

export interface ColumnDef {
  id: string
  label: string
  sortKey?: string
  className?: string
  render: (row: ProfileListItem) => React.ReactNode
}

const PREF_KEY = 'zeus-vault.columns'

export function useColumnVisibility(all: string[]) {
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
      localStorage.setItem(PREF_KEY, JSON.stringify(next))
      return next
    })
  }
  return { hidden, toggle, isHidden: (id: string) => hidden.includes(id) }
}

export function ProfileTable({
  rows,
  columns,
  sort,
  onSort,
  onOpen,
  selected,
  onToggleSelect,
  onToggleAll,
  showSelect = true,
  dense = true,
}: {
  rows: ProfileListItem[]
  columns: ColumnDef[]
  sort?: { key: string; dir: 'asc' | 'desc' } | undefined
  onSort?: (key: string) => void
  onOpen: (id: string) => void
  selected?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleAll?: () => void
  showSelect?: boolean
  dense?: boolean
}) {
  const [preview, setPreview] = useState<{ row: ProfileListItem; x: number; y: number } | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const cellPad = dense ? 'px-2 py-[5px]' : 'px-3 py-2'

  const handleMouseMove = (event: React.MouseEvent, row: ProfileListItem) => {
    const bounds = rootRef.current?.getBoundingClientRect()
    const x = event.clientX + 18
    const y = event.clientY + 14
    const maxX = window.innerWidth - 300
    const maxY = window.innerHeight - 220
    setPreview({ row, x: Math.min(x, maxX), y: Math.min(y, maxY) })
    void bounds
  }

  return (
    <div ref={rootRef} className="relative overflow-x-auto vault-scroll">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-[#0E1013]">
          <tr className="border-b border-vault-border">
            {showSelect && (
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#E34B64]"
                  checked={selected && rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onChange={onToggleAll}
                  aria-label="Select all"
                />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.id} className={`${cellPad} select-none font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-vault-text2`}>
                {col.sortKey && onSort ? (
                  <button className="sort-header inline-flex items-center gap-1 transition-colors" onClick={() => onSort(col.sortKey!)}>
                    {col.label}
                    {sort?.key === col.sortKey ? (
                      sort.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                    ) : (
                      <ArrowUpDown size={10} className="opacity-40" />
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onOpen(row.id)}
              onMouseMove={(e) => handleMouseMove(e, row)}
              onMouseLeave={() => setPreview(null)}
              className="table-row-hover row-alt cursor-pointer border-b border-white/[0.045] transition-colors"
            >
              {showSelect && (
                <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#E34B64]"
                    checked={selected?.has(row.id) ?? false}
                    onChange={() => onToggleSelect?.(row.id)}
                    aria-label={`Select ${row.fullName}`}
                  />
                </td>
              )}
              {columns.map((col) => (
                <td key={col.id} className={`${cellPad} ${col.className ?? ''}`} onMouseEnter={col.id === 'photo' ? () => setPreviewPhoto(true) : undefined} onMouseLeave={col.id === 'photo' ? () => setPreviewPhoto(false) : undefined}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + (showSelect ? 1 : 0)} className="px-4 py-12 text-center">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-vault-muted">No records match the current filter</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {preview &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 w-64 border border-vault-border bg-[#121419]/97 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur-sm"
            style={{ left: preview.x, top: preview.y }}
          >
            <div className="flex items-center gap-3">
              <img
                src={preview.row.avatar ?? defaultAvatar(preview.row.fullName)}
                alt={preview.row.fullName}
                className={`rounded-full border border-white/10 object-cover transition-all duration-200 ${previewPhoto ? 'h-16 w-16' : 'h-12 w-12'}`}
                draggable={false}
              />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold leading-tight text-vault-text">{preview.row.fullName}</div>
                <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-vault-red">{preview.row.profileCode}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-vault-text2">
                  <FlagIcon iso2={preview.row.countryIso2} className="!h-[9px] !w-[13px]" />
                  <span className="truncate">{preview.row.country || 'Unknown'}{preview.row.city ? ` · ${preview.row.city}` : ''}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.07] pt-2">
              <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-vault-muted">{preview.row.categoryName}</span>
              <span className={`font-mono text-[8px] uppercase tracking-[0.16em] ${preview.row.status === 'active' ? 'text-vault-green' : 'text-vault-amber'}`}>{preview.row.status}</span>
            </div>
            {preview.row.isDemo && <div className="mt-1.5 font-mono text-[7.5px] uppercase tracking-[0.3em] text-vault-amber/70">Fictional demonstration record</div>}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function buildDefaultColumns(dateStyle: 'utc' | 'military' = 'utc'): ColumnDef[] {
  const photo: ColumnDef = {
    id: 'photo',
    label: 'Photo',
    className: 'w-12',
    render: (r) => <Avatar src={r.avatar} name={r.fullName} size={denseSize(26)} />,
  }
  const code: ColumnDef = {
    id: 'profileCode',
    label: 'Profile ID',
    sortKey: 'profileCode',
    render: (r) => <span className="font-mono text-[10px] text-vault-red">{r.profileCode}</span>,
  }
  const name: ColumnDef = {
    id: 'fullName',
    label: 'Full Name',
    sortKey: 'fullName',
    render: (r) => (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-vault-text">
        <span className="max-w-[150px] truncate">{r.fullName}</span>
        {r.isFavorite && <Star size={10} className="shrink-0 fill-vault-amber text-vault-amber" />}
        {r.isDemo && <span className="shrink-0 rounded-sm border border-vault-amber/40 px-1 font-mono text-[7px] text-vault-amber">DEMO</span>}
      </span>
    ),
  }
  const username: ColumnDef = {
    id: 'username',
    label: 'Username',
    sortKey: 'username',
    render: (r) => <span className="font-mono text-[10px] text-vault-text2">{r.username || ' - '}</span>,
  }
  const country: ColumnDef = {
    id: 'country',
    label: 'Country',
    sortKey: 'country',
    render: (r) => (
      <span className="flex items-center gap-1.5 text-[10.5px] text-vault-text2">
        <FlagIcon iso2={r.countryIso2} />
        <span className="max-w-[110px] truncate">{r.country || ' - '}</span>
      </span>
    ),
  }
  const location: ColumnDef = {
    id: 'location',
    label: 'Location',
    sortKey: 'city',
    render: (r) => <span className="text-[10.5px] text-vault-text2">{[r.city, r.state].filter(Boolean).join(', ') || ' - '}</span>,
  }
  const phone: ColumnDef = {
    id: 'phone',
    label: 'Phone',
    sortKey: 'phone',
    render: (r) => <span className="font-mono text-[9.5px] text-vault-text2">{r.phone || ' - '}</span>,
  }
  const email: ColumnDef = {
    id: 'email',
    label: 'Email',
    sortKey: 'email',
    render: (r) => <span className="max-w-[150px] truncate font-mono text-[9.5px] text-vault-text2">{r.email || ' - '}</span>,
  }
  const category: ColumnDef = {
    id: 'category',
    label: 'Category',
    sortKey: 'category',
    render: (r) => (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: r.categoryColor }} />
        <span className="text-[10px] text-vault-text2">{r.categoryName}</span>
      </span>
    ),
  }
  const createdBy: ColumnDef = {
    id: 'createdBy',
    label: 'Created By',
    render: (r) => <span className="font-mono text-[9.5px] text-vault-text2">{r.createdByUsername}</span>,
  }
  const createdAt: ColumnDef = {
    id: 'createdAt',
    label: 'Created',
    sortKey: 'createdAt',
    render: (r) => <span className="font-mono text-[9px] text-vault-muted">{formatTimestamp(r.createdAt, dateStyle)}</span>,
  }
  const updatedAt: ColumnDef = {
    id: 'updatedAt',
    label: 'Updated',
    sortKey: 'updatedAt',
    render: (r) => <span className="font-mono text-[9px] text-vault-muted">{formatTimestamp(r.updatedAt, dateStyle)}</span>,
  }
  const status: ColumnDef = {
    id: 'status',
    label: 'Status',
    sortKey: 'status',
    render: (r) => (
      <span className={`font-mono text-[8.5px] uppercase tracking-[0.16em] ${r.status === 'active' ? 'text-vault-green' : 'text-vault-amber'}`}>{r.status}</span>
    ),
  }
  return [photo, code, name, username, country, location, phone, email, category, createdBy, createdAt, updatedAt, status]
}

function denseSize(size: number): number {
  return size
}

export function ColumnToggle({ all, hidden, toggle }: { all: ColumnDef[]; hidden: string[]; toggle: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button className="vault-btn !px-2" onClick={() => setOpen((v) => !v)} title="Toggle columns" aria-label="Toggle columns">
        <Columns3 size={13} />
      </button>
      {open && (
        <div className="vault-panel absolute right-0 top-full z-30 mt-2 w-48 p-2">
          <div className="micro-label px-2 pb-1.5">Columns</div>
          {all.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[10.5px] text-vault-text2 hover:bg-white/[0.03] hover:text-vault-text">
              <input type="checkbox" className="h-3.5 w-3.5 accent-[#E34B64]" checked={!hidden.includes(c.id)} onChange={() => toggle(c.id)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
