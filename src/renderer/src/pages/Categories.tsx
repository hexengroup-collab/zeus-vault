import { FormEvent, useMemo, useState } from 'react'
import { FolderPlus, Pencil, Trash2, Users2 } from 'lucide-react'
import { call, zeus, ApiFailure } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { Modal } from '@/components/Modal'
import { toastError, toastOk } from '@/stores/toast'
import { formatTimestamp } from '@shared/time'
import type { CategoryRecord } from '@shared/types'

const COLORS = ['#E34B64', '#D69B45', '#7A8B9A', '#4F8A6B', '#8A7FB0', '#5F8FB0', '#B0653A', '#858991']

export function Categories() {
  const { data: categories, loading, reload } = useAsync(() => call(zeus.categories.list()), [])
  const [editTarget, setEditTarget] = useState<CategoryRecord | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoryRecord | null>(null)
  const [reassignTo, setReassignTo] = useState<string>('')

  const others = useMemo(() => (categories ?? []).filter((c) => c.id !== deleteTarget?.id), [categories, deleteTarget])

  return (
    <div className="p-5">
      <div className="flex items-end justify-between border-b border-vault-border-soft pb-4">
        <div>
          <div className="micro-label">Classification System</div>
          <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">CATEGORIES</h1>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">{categories?.length ?? 0} classes · custom taxonomy permitted</p>
        </div>
        <button className="vault-btn vault-btn-primary" onClick={() => setEditTarget('new')}><FolderPlus size={12} /> New Category</button>
      </div>

      {loading && <div className="py-12 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-vault-muted">Loading taxonomy…</div>}

      <div className="mt-4 grid grid-cols-1 gap-px border border-vault-border-soft bg-white/[0.04] md:grid-cols-2 xl:grid-cols-4">
        {(categories ?? []).map((c) => (
          <article key={c.id} className="group relative bg-[#0E1014] p-4 transition-colors hover:bg-[#10131A]">
            <div className="flex items-start justify-between">
              <div className="flex h-9 w-9 items-center justify-center border" style={{ borderColor: `${c.color}66`, background: `${c.color}14` }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 10px ${c.color}88` }} />
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-text" onClick={() => setEditTarget(c)} aria-label="Edit category"><Pencil size={12} /></button>
                <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-red" onClick={() => { setReassignTo(''); setDeleteTarget(c) }} aria-label="Delete category"><Trash2 size={12} /></button>
              </div>
            </div>
            <h2 className="mt-3 font-condensed text-2xl font-semibold tracking-wide text-vault-text">{c.name}</h2>
            <p className="mt-0.5 min-h-[2.2em] text-[10px] leading-snug text-vault-text2">{c.description || 'No description.'}</p>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 font-mono text-[8px] uppercase tracking-[0.16em] text-vault-muted">
              <span className="flex items-center gap-1.5"><Users2 size={9} />{c.profileCount} dossier{c.profileCount === 1 ? '' : 's'}</span>
              <span title={`Updated ${formatTimestamp(c.updatedAt)}`}>upd {formatTimestamp(c.updatedAt, 'military').split(' / ')[0]}</span>
            </div>
            {c.isDefault && <span className="absolute right-2 top-2 font-mono text-[7px] uppercase tracking-[0.3em] text-vault-muted/60">Default</span>}
          </article>
        ))}
      </div>

      {/* Edit/create modal */}
      <CategoryModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); reload() }}
      />

      {/* Delete with reassignment */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Retire Category"
        subtitle={deleteTarget?.name}
        width="max-w-md"
      >
        {deleteTarget && (
          <>
            {deleteTarget.profileCount > 0 ? (
              <p className="text-[12px] leading-relaxed text-vault-text2">
                This category holds <span className="text-vault-text">{deleteTarget.profileCount} profile(s)</span>. Reassign them before deletion, or they become uncategorized.
              </p>
            ) : (
              <p className="text-[12px] leading-relaxed text-vault-text2">This category is empty and will be removed. This action is logged.</p>
            )}
            {deleteTarget.profileCount > 0 && (
              <label className="mt-3 block">
                <span className="micro-label mb-1 block">Reassign profiles to</span>
                <select className="vault-select h-9 w-full px-2" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                  <option value="__none__">Leave Uncategorized</option>
                  {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="vault-btn vault-btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="vault-btn vault-btn-danger"
                onClick={async () => {
                  try {
                    const target = deleteTarget.profileCount > 0 ? (reassignTo === '__none__' || reassignTo === '' ? null : reassignTo) : null
                    await call(zeus.categories.delete({ id: deleteTarget.id, reassignTo: target }))
                    toastOk('Category retired', deleteTarget.name)
                    setDeleteTarget(null)
                    reload()
                  } catch (e) {
                    const msg = e instanceof ApiFailure ? e.message : 'Delete failed.'
                    toastError('Delete blocked', msg)
                  }
                }}
              >
                Delete Category
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function CategoryModal({ target, onClose, onSaved }: { target: CategoryRecord | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const editing = target && target !== 'new' ? target : null
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)

  // Reset form whenever the target changes
  const [initializedFor, setInitializedFor] = useState<string | 'new' | null>(null)
  const targetKey = target === 'new' ? 'new' : target?.id ?? null
  if (target && targetKey !== initializedFor) {
    setInitializedFor(targetKey)
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setColor(editing?.color ?? COLORS[0])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      if (editing) {
        await call(zeus.categories.update({ id: editing.id, name: name.trim(), description: description.trim(), color }))
        toastOk('Category updated', name.trim())
      } else {
        await call(zeus.categories.create({ name: name.trim(), description: description.trim(), color }))
        toastOk('Category created', name.trim())
      }
      onSaved()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit Category' : 'New Category'} subtitle="Classification taxonomy">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="micro-label mb-1 block">Name *</span>
          <input autoFocus className="vault-input h-10 w-full px-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client" />
        </label>
        <label className="block">
          <span className="micro-label mb-1 block">Description</span>
          <textarea className="vault-textarea h-16 w-full resize-none px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What belongs in this class…" />
        </label>
        <div>
          <span className="micro-label mb-1 block">Indicator</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-white/70' : 'border-transparent'}`} style={{ background: c }} aria-label={`Color ${c}`} />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="vault-btn vault-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="vault-btn vault-btn-primary" disabled={saving || !name.trim()}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'}</button>
        </div>
      </form>
    </Modal>
  )
}
