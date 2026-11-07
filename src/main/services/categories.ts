import type { Db } from '../db/sqlite'
import type { CategoryRecord } from '../../shared/types'
import { AppError, assertFound, validationError } from '../lib/errors'
import { DEFAULT_CATEGORIES } from '../../shared/constants'
import type { AuditService, Actor } from './audit'

export class CategoriesService {
  constructor(
    private db: Db,
    private audit: AuditService,
  ) {}

  seedDefaults(actorUsername: string): void {
    const count = Number(this.db.value<number>('SELECT COUNT(*) FROM profile_categories') ?? 0)
    if (count > 0) return
    const now = new Date().toISOString()
    for (const c of DEFAULT_CATEGORIES) {
      this.db.run(
        `INSERT INTO profile_categories(id, name, description, color, icon, is_default, created_by_username, created_at, updated_at)
         VALUES (?,?,?,?,?,1,?,?,?)`,
        [crypto.randomUUID(), c.name, c.description, c.color, c.icon, actorUsername, now, now],
      )
    }
  }

  list(): CategoryRecord[] {
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT c.*, (SELECT COUNT(*) FROM profiles p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS profile_count
       FROM profile_categories c ORDER BY c.name COLLATE NOCASE ASC`,
    )
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description ?? ''),
      color: String(r.color),
      icon: String(r.icon),
      profileCount: Number(r.profile_count),
      createdBy: (r.created_by_username as string) ?? null,
      createdAt: String(r.created_at),
      updatedBy: (r.updated_by_username as string) ?? null,
      updatedAt: String(r.updated_at),
      isDefault: Number(r.is_default) === 1,
    }))
  }

  create(input: { name: string; description?: string; color?: string; icon?: string }, actor: Actor): CategoryRecord {
    const name = input.name.trim()
    if (name.length < 2) validationError([{ field: 'name', message: 'Name is required.' }])
    const dup = this.db.value<number>('SELECT COUNT(*) FROM profile_categories WHERE name = ? COLLATE NOCASE', [name])
    if (dup) validationError([{ field: 'name', message: 'A category with that name already exists.' }])
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO profile_categories(id, name, description, color, icon, is_default, created_by, created_by_username, created_at, updated_at)
       VALUES (?,?,?,?,?,0,?,?,?,?)`,
      [id, name, (input.description ?? '').trim(), input.color ?? '#858991', input.icon ?? 'archive', actor.id, actor.username, now, now],
    )
    this.audit.record(actor, { eventType: 'CATEGORY_CREATED', targetType: 'category', targetId: id, targetLabel: name })
    return this.list().find((c) => c.id === id)!
  }

  update(id: string, input: { name?: string; description?: string; color?: string; icon?: string }, actor: Actor): CategoryRecord {
    const existing = assertFound(this.db.get<{ id: string; name: string }>('SELECT id, name FROM profile_categories WHERE id = ?', [id]), 'Category')
    if (input.name) {
      const name = input.name.trim()
      if (name.length < 2) validationError([{ field: 'name', message: 'Name is required.' }])
      const dup = this.db.value<number>('SELECT COUNT(*) FROM profile_categories WHERE name = ? COLLATE NOCASE AND id <> ?', [name, id])
      if (dup) validationError([{ field: 'name', message: 'A category with that name already exists.' }])
      this.db.run('UPDATE profile_categories SET name = ?, updated_by = ?, updated_by_username = ?, updated_at = ? WHERE id = ?', [name, actor.id, actor.username, new Date().toISOString(), id])
    }
    if (input.description !== undefined) this.db.run('UPDATE profile_categories SET description = ?, updated_by = ?, updated_by_username = ?, updated_at = ? WHERE id = ?', [input.description, actor.id, actor.username, new Date().toISOString(), id])
    if (input.color) this.db.run('UPDATE profile_categories SET color = ?, updated_by = ?, updated_by_username = ?, updated_at = ? WHERE id = ?', [input.color, actor.id, actor.username, new Date().toISOString(), id])
    if (input.icon) this.db.run('UPDATE profile_categories SET icon = ?, updated_by = ?, updated_by_username = ?, updated_at = ? WHERE id = ?', [input.icon, actor.id, actor.username, new Date().toISOString(), id])
    this.audit.record(actor, { eventType: 'CATEGORY_UPDATED', targetType: 'category', targetId: id, targetLabel: input.name ?? existing.name })
    return this.list().find((c) => c.id === id)!
  }

  delete(id: string, reassignTo: string | null, actor: Actor): void {
    const existing = assertFound(this.db.get<{ id: string; name: string }>('SELECT id, name FROM profile_categories WHERE id = ?', [id]), 'Category')
    const count = Number(this.db.value<number>('SELECT COUNT(*) FROM profiles WHERE category_id = ? AND deleted_at IS NULL', [id]) ?? 0)
    if (count > 0 && reassignTo === undefined) {
      throw new AppError('VALIDATION', `Category holds ${count} profile(s). Reassign them first.`, [{ field: 'reassignTo', message: `${count} profile(s) use this category.` }])
    }
    if (count > 0) {
      if (reassignTo === id) throw new AppError('VALIDATION', 'Choose a different category.')
      if (reassignTo !== null) assertFound(this.db.get('SELECT id FROM profile_categories WHERE id = ?', [reassignTo]), 'Target category')
      this.db.run('UPDATE profiles SET category_id = ? WHERE category_id = ?', [reassignTo, id])
    }
    this.db.run('DELETE FROM profile_categories WHERE id = ?', [id])
    this.audit.record(actor, { eventType: 'CATEGORY_DELETED', targetType: 'category', targetId: id, targetLabel: existing.name, detail: count > 0 ? `Profiles reassigned (${count})` : 'Empty category removed' })
  }
}
