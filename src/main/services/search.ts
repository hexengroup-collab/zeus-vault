import type { Db } from '../db/sqlite'
import type { ProfileListItem, Paginated, ProfileFilters, SearchResults, SavedSearch, TagRecord, CountryStat } from '../../shared/types'
import { COUNTRIES } from '../../shared/countries'
import { interpretQuery } from '../nlp/query'
import type { Actor } from './audit'
import type { ProfilesService } from './profiles'

export class SearchService {
  constructor(
    private db: Db,
    private profiles: ProfilesService,
  ) {}

  search(text: string, page: number, pageSize: number, actor: Actor): SearchResults {
    const started = Date.now()
    const interpretation = interpretQuery(text, { currentUsername: actor.username })
    const filters: ProfileFilters = { ...interpretation.filters }
    if (interpretation.freeText) filters.search = interpretation.freeText
    const result: Paginated<ProfileListItem> = this.profiles.list({ ...filters, view: filters.view ?? 'all-status', page, pageSize }, actor.id ?? '')
    return {
      interpretation,
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      tookMs: Date.now() - started,
    }
  }

  saveSearch(name: string, query: string, filters: ProfileFilters | null, actor: Actor & { userId: string }): SavedSearch {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.db.run('INSERT INTO saved_searches(id, user_id, name, kind, query, filters, created_at) VALUES (?,?,?,?,?,?,?)', [
      id, actor.userId, name.slice(0, 80), 'nlp', query, filters ? JSON.stringify(filters) : null, now,
    ])
    this.db.run('INSERT INTO nlp_history(id, user_id, mode, command, result_json, created_at) VALUES (?,?,?,?,?,?)', [
      crypto.randomUUID(), actor.userId, 'save', query, JSON.stringify(filters ?? {}), now,
    ])
    return { id, name, kind: 'nlp', query, filters: filters ? JSON.stringify(filters) : null, createdAt: now }
  }

  savedSearches(userId: string): SavedSearch[] {
    return this.db.all<Record<string, unknown>>('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC', [userId]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind) as SavedSearch['kind'],
      query: String(r.query),
      filters: (r.filters as string) ?? null,
      createdAt: String(r.created_at),
    }))
  }

  deleteSavedSearch(id: string, userId: string): void {
    this.db.run('DELETE FROM saved_searches WHERE id = ? AND user_id = ?', [id, userId])
  }

  recordSearch(userId: string, mode: string, command: string, resultJson: unknown): void {
    this.db.run('INSERT INTO nlp_history(id, user_id, mode, command, result_json, created_at) VALUES (?,?,?,?,?,?)', [
      crypto.randomUUID(), userId, mode, command.slice(0, 2000), JSON.stringify(resultJson).slice(0, 8000), new Date().toISOString(),
    ])
  }

  recentSearches(userId: string, limit = 15): { id: string; mode: string; command: string; createdAt: string }[] {
    return this.db.all<Record<string, unknown>>('SELECT id, mode, command, created_at FROM nlp_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]).map((r) => ({
      id: String(r.id),
      mode: String(r.mode),
      command: String(r.command),
      createdAt: String(r.created_at),
    }))
  }

  tags(): TagRecord[] {
    return this.db.all<TagRecord>(
      `SELECT t.id, t.name, t.color, (SELECT COUNT(*) FROM profile_tag_assignments a WHERE a.tag_id = t.id) AS profileCount
       FROM profile_tags t ORDER BY t.name COLLATE NOCASE`,
    )
  }

  countryStats(): CountryStat[] {
    const counts = this.db.all<{ iso2: string; n: number; favs: number; last: string | null }>(
      `SELECT p.country_iso2 AS iso2, COUNT(*) AS n,
              SUM(CASE WHEN p.status='active' THEN 1 ELSE 0 END) AS favs,
              MAX(p.updated_at) AS last
       FROM profiles p WHERE p.deleted_at IS NULL AND p.country_iso2 <> '' GROUP BY p.country_iso2`,
    )
    const byIso = new Map(counts.map((c) => [c.iso2, c]))
    return COUNTRIES.map((c) => {
      const row = byIso.get(c.iso2)
      return {
        name: c.name,
        iso2: c.iso2,
        dial: c.dial,
        region: c.region,
        profileCount: row ? Number(row.n) : 0,
        favourites: 0,
        lastUpdated: row?.last ?? null,
      }
    })
  }
}
