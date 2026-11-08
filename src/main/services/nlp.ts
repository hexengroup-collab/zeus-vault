// NLP support service: user-editable aliases + local hashed embeddings.
import type { Db } from '../db/sqlite'
import { embedText, embedTfidf, computeIdf, cosine } from '../lib/embed'
import { AppError } from '../lib/errors'
import type { Actor } from './audit'

export class NlpService {
  private aliasesCache: Map<string, string> | null = null

  constructor(private db: Db) {}

  aliases(): { alias: string; canonical: string }[] {
    return this.db
      .all<{ alias_lower: string; canonical: string }>('SELECT alias_lower, canonical FROM nlp_aliases ORDER BY alias_lower')
      .map((r) => ({ alias: r.alias_lower, canonical: r.canonical }))
  }

  aliasMap(): ReadonlyMap<string, string> {
    if (this.aliasesCache) return this.aliasesCache
    const m = new Map<string, string>()
    for (const r of this.db.all<{ alias_lower: string; canonical: string }>('SELECT alias_lower, canonical FROM nlp_aliases')) {
      m.set(r.alias_lower, r.canonical)
    }
    this.aliasesCache = m
    return m
  }

  addAlias(alias: string, canonical: string, actor: Actor): void {
    const a = alias.trim().toLowerCase()
    const c = canonical.trim()
    if (a.length < 2) throw new AppError('VALIDATION', 'Alias must be at least 2 characters.')
    if (!c) throw new AppError('VALIDATION', 'Canonical value is required.')
    this.db.run('INSERT OR REPLACE INTO nlp_aliases(alias_lower, canonical, updated_at, updated_by) VALUES (?,?,?,?)', [
      a,
      c,
      new Date().toISOString(),
      actor.username,
    ])
    this.aliasesCache = null
  }

  deleteAlias(alias: string): void {
    this.db.run('DELETE FROM nlp_aliases WHERE alias_lower = ?', [alias.trim().toLowerCase()])
    this.aliasesCache = null
  }

  private profileText(profileId: string): string {
    const p = this.db.get<Record<string, unknown>>('SELECT * FROM profiles WHERE id = ?', [profileId])
    if (!p) return ''
    const c = this.db.get<Record<string, unknown>>('SELECT * FROM profile_contacts WHERE profile_id = ?', [profileId])
    const a = this.db.get<Record<string, unknown>>('SELECT * FROM profile_addresses WHERE profile_id = ?', [profileId])
    const pr = this.db.get<Record<string, unknown>>('SELECT * FROM profile_professional WHERE profile_id = ?', [profileId])
    const customs = this.db.all<{ label: string; value: string }>('SELECT label, value FROM profile_custom_fields WHERE profile_id = ?', [profileId])
    const parts = [p, c, a, pr].map((row) =>
      row
        ? Object.entries(row)
            .filter(([k, v]) => typeof v === 'string' && !k.endsWith('_enc') && k !== 'id' && k !== 'profile_id')
            .map(([, v]) => String(v))
            .join(' ')
        : '',
    )
    parts.push(customs.map((r) => `${r.label} ${r.value}`).join(' '))
    return parts.join(' ')
  }

  embedProfile(profileId: string): void {
    const text = this.profileText(profileId)
    this.db.run('INSERT OR REPLACE INTO text_embeddings(profile_id, vector, updated_at) VALUES (?,?,?)', [
      profileId,
      JSON.stringify(embedText(text)),
      new Date().toISOString(),
    ])
  }

  embedAll(): { embedded: number } {
    const ids = this.db.all<{ id: string }>('SELECT id FROM profiles WHERE deleted_at IS NULL')
    const texts = ids.map(({ id }) => this.profileText(id))
    const idf = computeIdf(texts)
    for (let i = 0; i < ids.length; i++) {
      const v = embedTfidf(texts[i], idf)
      this.db.run('INSERT OR REPLACE INTO text_embeddings(profile_id, vector, updated_at) VALUES (?,?,?)', [
        ids[i].id,
        JSON.stringify(v),
        new Date().toISOString(),
      ])
    }
    return { embedded: ids.length }
  }

  semanticSearch(query: string, limit = 25): { profileId: string; score: number }[] {
    const q = embedText(query)
    const rows = this.db.all<{ profile_id: string; vector: string }>('SELECT profile_id, vector FROM text_embeddings')
    const out: { profileId: string; score: number }[] = []
    for (const r of rows) {
      try {
        const v = JSON.parse(r.vector) as number[]
        const s = cosine(q, v)
        if (s > 0.02) out.push({ profileId: r.profile_id, score: Math.round(s * 1000) / 10 })
      } catch {
        /* skip corrupt row */
      }
    }
    out.sort((x, y) => y.score - x.score)
    return out.slice(0, limit)
  }
}
