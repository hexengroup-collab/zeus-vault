// Local photo token service.
// Tokens are computed once, at upload time, and stored. Image search scores
// the QUERY image against stored tokens — it never re-decodes archive blobs.
// The queue processes one image at a time and yields to the event loop so
// batch tokenization never stresses the PC.
import crypto from 'node:crypto'
import type { Db } from '../db/sqlite'
import { tokenizeImage, scoreToken, scoreFaceToken, descriptorDistance, cosineSim, DESCRIPTOR_TOLERANCE, DESCRIPTOR_MARGIN, PROFILE_DISTANCE_LIMIT, GEOMETRY_CORROBORATION, PARTIAL_DISTANCE_LIMIT, PARTIAL_MARGIN, type PhotoToken, type PhotoMatch } from '../lib/vision'
import { AppError } from '../lib/errors'
import type { Actor } from './audit'

export interface PhotoQueueStatus {
  queued: number
  processing: number
  done: number
  failed: number
  current: string | null
  lastError: string | null
}

interface TokenRow {
  id: string
  profile_id: string
  image_id: string | null
  kind: 'avatar' | 'gallery' | 'attachment'
  phash: string | null
  ahash: string | null
  face_detected: number
  face_phash: string | null
  face_box: string | null
  face_geom: string | null
  face_desc: string | null
  histogram: string | null
  status: 'queued' | 'processing' | 'done' | 'failed'
  error: string | null
  attempts: number
}

export class PhotosService {
  private running = false
  private currentName: string | null = null

  constructor(private db: Db) {}

  private rowToToken(r: TokenRow): PhotoToken | null {
    if (!r.phash || !r.histogram) return null
    try {
      const hist = JSON.parse(r.histogram) as number[]
      const geom = r.face_geom ? (JSON.parse(r.face_geom) as number[]) : null
      return {
        phash: r.phash,
        ahash: r.ahash ?? '',
        histogram: hist,
        faceDetected: r.face_detected === 1,
        facePhash: r.face_phash ?? null,
        faceBox: r.face_box ? (JSON.parse(r.face_box) as PhotoToken['faceBox']) : null,
        faceGeom: geom,
        width: 0,
        height: 0,
      }
    } catch {
      return null
    }
  }

  enqueue(profileId: string, imageId: string | null, kind: 'avatar' | 'gallery' | 'attachment'): void {
    const now = new Date().toISOString()
    this.db.run(
      `INSERT OR REPLACE INTO photo_tokens(id, profile_id, image_id, kind, status, created_at, updated_at)
       VALUES (?,?,?,?, 'queued', ?, ?)
       ON CONFLICT(profile_id, image_id, kind) DO UPDATE SET status='queued', error=NULL, updated_at=excluded.updated_at`,
      [crypto.randomUUID(), profileId, imageId, kind, now, now],
    )
    void this.kick()
  }

  removeToken(profileId: string, imageId: string | null, kind: 'avatar' | 'gallery' | 'attachment'): void {
    this.db.run('DELETE FROM photo_tokens WHERE profile_id = ? AND image_id IS ? AND kind = ?', [profileId, imageId, kind])
  }

  enqueueAllProfiles(): { queued: number } {
    const profiles = this.db.all<{ id: string; avatar_blob: string | null }>(
      'SELECT id, avatar_blob FROM profiles WHERE deleted_at IS NULL AND avatar_blob IS NOT NULL',
    )
    const gallery = this.db.all<{ id: string; profile_id: string }>('SELECT id, profile_id FROM profile_images WHERE kind = ? ', ['gallery'])
    const attachments = this.db.all<{ id: string; profile_id: string }>(`SELECT id, profile_id FROM attachments WHERE mime LIKE 'image/%'`)
    const done = new Set(this.db.all<{ profile_id: string; image_id: string | null; kind: string }>(`SELECT profile_id, image_id, kind FROM photo_tokens WHERE status='done'`).map((r) => `${r.profile_id}|${r.image_id ?? ''}|${r.kind}`))
    const now = new Date().toISOString()
    const upsert = (profileId: string, imageId: string | null, kind: string) => {
      this.db.run(
        `INSERT OR REPLACE INTO photo_tokens(id, profile_id, image_id, kind, status, created_at, updated_at)
         VALUES (?,?,?,?, 'queued', ?, ?)
         ON CONFLICT(profile_id, image_id, kind) DO UPDATE SET status='queued', error=NULL, updated_at=excluded.updated_at`,
        [crypto.randomUUID(), profileId, imageId, kind, now, now],
      )
    }
    let n = 0
    for (const p of profiles) {
      if (done.has(`${p.id}||avatar`)) continue
      upsert(p.id, null, 'avatar')
      n++
    }
    for (const g of gallery) {
      if (done.has(`${g.profile_id}|${g.id}|gallery`)) continue
      upsert(g.profile_id, g.id, 'gallery')
      n++
    }
    for (const a of attachments) {
      if (done.has(`${a.profile_id}|${a.id}|attachment`)) continue
      upsert(a.profile_id, a.id, 'attachment')
      n++
    }
    void this.kick()
    return { queued: n }
  }

  status(actor: Actor): PhotoQueueStatus {
    void actor
    const counts = this.db.all<{ status: string; c: number }>('SELECT status, COUNT(*) c FROM photo_tokens GROUP BY status')
    const out: PhotoQueueStatus = { queued: 0, processing: 0, done: 0, failed: 0, current: this.currentName, lastError: null }
    for (const r of counts) {
      const key = String(r.status) as 'queued' | 'processing' | 'done' | 'failed'
      if (key === 'queued' || key === 'processing' || key === 'done' || key === 'failed') out[key] = Number(r.c)
    }
    const err = this.db.get<{ error: string | null }>(`SELECT error FROM photo_tokens WHERE status='failed' AND error IS NOT NULL ORDER BY updated_at DESC LIMIT 1`)
    out.lastError = err?.error ?? null
    return out
  }

  private async kick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      let row = this.db.get<TokenRow>(`SELECT * FROM photo_tokens WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`)
      while (row) {
        this.currentName = this.profileName(row.profile_id)
        this.db.run(`UPDATE photo_tokens SET status='processing', updated_at=? WHERE id=?`, [new Date().toISOString(), row.id])
        try {
          const dataUrl = this.imageDataUrl(row.profile_id, row.image_id, row.kind)
          if (!dataUrl) throw new Error('Image no longer exists')
          const token = await tokenizeImage(dataUrl)
          this.db.run(
            `UPDATE photo_tokens SET phash=?, ahash=?, face_detected=?, face_phash=?, face_box=?, histogram=?, status='done', error=NULL, attempts=attempts+1, updated_at=? WHERE id=?`,
            [
              token.phash,
              token.ahash,
              token.faceDetected ? 1 : 0,
              token.facePhash,
              token.faceBox ? JSON.stringify(token.faceBox) : null,
              JSON.stringify(token.histogram),
              new Date().toISOString(),
              row.id,
            ],
          )
        } catch (e) {
          this.db.run(`UPDATE photo_tokens SET status='failed', error=?, attempts=attempts+1, updated_at=? WHERE id=?`, [
            e instanceof Error ? e.message.slice(0, 200) : String(e),
            new Date().toISOString(),
            row.id,
          ])
        }
        await new Promise((r) => setTimeout(r, 25))
        row = this.db.get<TokenRow>(`SELECT * FROM photo_tokens WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`)
      }
    } finally {
      this.running = false
      this.currentName = null
    }
  }

  private profileName(id: string): string | null {
    const r = this.db.get<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = ?', [id])
    return r?.full_name ?? null
  }

  private imageDataUrl(profileId: string, imageId: string | null, kind: string): string | null {
    if (kind === 'avatar' || !imageId) {
      const r = this.db.get<{ avatar_blob: string | null }>('SELECT avatar_blob FROM profiles WHERE id = ?', [profileId])
      return r?.avatar_blob ?? null
    }
    if (kind === 'attachment') {
      const r = this.db.get<{ blob: string }>('SELECT blob FROM attachments WHERE id = ? AND profile_id = ?', [imageId, profileId])
      return r?.blob ?? null
    }
    const r = this.db.get<{ blob: string }>('SELECT blob FROM profile_images WHERE id = ? AND profile_id = ?', [imageId, profileId])
    return r?.blob ?? null
  }

  private matchImage(r: TokenRow): { label: string; image: string | null } {
    if (r.kind === 'avatar') return { label: 'Profile photo', image: this.imageDataUrl(r.profile_id, null, 'avatar') }
    if (r.kind === 'gallery' && r.image_id) {
      const img = this.db.get<{ name: string }>('SELECT name FROM profile_images WHERE id = ?', [r.image_id])
      return { label: `Gallery: ${img?.name ?? r.image_id}`, image: this.imageDataUrl(r.profile_id, r.image_id, 'gallery') }
    }
    if (r.kind === 'attachment' && r.image_id) {
      const att = this.db.get<{ name: string }>('SELECT name FROM attachments WHERE id = ?', [r.image_id])
      return { label: `Attachment: ${att?.name ?? r.image_id}`, image: this.imageDataUrl(r.profile_id, r.image_id, 'attachment') }
    }
    return { label: r.kind, image: null }
  }

  async search(queryDataUrl: string, filters: { view?: string; categoryId?: string; country?: string; text?: string; minScore?: number; kinds?: ('avatar' | 'gallery' | 'attachment')[] } = {}): Promise<{ query: PhotoToken['phash']; faceDetected: boolean; matches: PhotoMatch[] }> {
    if (!queryDataUrl) throw new AppError('VALIDATION', 'Provide a query image.')
    const allowed = this.allowedProfileIds(filters)
    const rows = this.db.all<TokenRow>(`SELECT * FROM photo_tokens WHERE status='done' AND phash IS NOT NULL`)
    const query = await tokenizeImage(queryDataUrl)
    const matches: PhotoMatch[] = []
    for (const r of rows) {
      if (allowed && !allowed.has(r.profile_id)) continue
      const t = this.rowToToken(r)
      if (!t) continue
      const s = scoreToken(query, t)
      if (s.score < (filters.minScore ?? 40)) continue
      const { label, image } = this.matchImage(r)
      matches.push({ tokenId: r.id, profileId: r.profile_id, kind: r.kind, score: s.score, phashSim: s.phashSim, histSim: s.histSim, faceSim: s.faceSim, faceDetected: t.faceDetected, label, image })
    }
    matches.sort((a, b) => b.score - a.score)
    // Faces need a stricter bar: vague similarity is not identification.
    const cutoff = query.faceDetected ? Math.max(filters.minScore ?? 0, 60) : (filters.minScore ?? 40)
    return { query: query.phash, faceDetected: query.faceDetected, matches: matches.filter((m) => m.score >= cutoff).slice(0, 12) }
  }

  async matchFace(cropDataUrl: string, geom: number[] | null = null, desc: number[] | null = null, quality = 1): Promise<{ profileId: string; score: number; phashSim: number; faceSim: number | null; name: string; code: string; avatar: string | null }[]> {
    if (!cropDataUrl && !desc?.length) throw new AppError('VALIDATION', 'Provide a face crop.')
    const q: Awaited<ReturnType<typeof tokenizeImage>> = cropDataUrl
      ? await tokenizeImage(cropDataUrl)
      : { phash: '', ahash: '', histogram: [], faceDetected: false, facePhash: null, faceBox: null, faceGeom: null, width: 0, height: 0 }
    if (geom && geom.length) q.faceGeom = geom
    // Descriptor distance (ageitgey semantics): identity is decided here.
    // Every reference photo is its own likeness; a person matches when ANY
    // reference is close (handles aging: old and young views coexist).
    const rows = this.db.all<TokenRow>(`SELECT * FROM photo_tokens WHERE status='done' AND phash IS NOT NULL`)
    const refDescs = new Map<string, { vec: number[]; row: TokenRow }[]>()
    for (const r of rows) {
      if (!r.face_desc) continue
      try {
        const vec = JSON.parse(r.face_desc) as number[]
        const list = refDescs.get(r.profile_id)
        if (list) list.push({ vec, row: r })
        else refDescs.set(r.profile_id, [{ vec, row: r }])
      } catch { /* skip */ }
    }
    const geomCentroids = new Map<string, number[]>()
    for (const r of rows) {
      if (!r.face_geom) continue
      try {
        const v = JSON.parse(r.face_geom) as number[]
        const list = geomCentroids.get(r.profile_id)
        if (!list) geomCentroids.set(r.profile_id, v)
      } catch { /* skip */ }
    }
    const best = new Map<string, { profileId: string; score: number; distance: number | null; phashSim: number; faceSim: number | null }>()
    const descriptorMode = desc?.length && refDescs.size > 0
    if (!descriptorMode) {
      for (const r of rows) {
        const t = this.rowToToken(r)
        if (!t) continue
        const s = scoreFaceToken(q, t)
        const prev = best.get(r.profile_id)
        if (!prev || s.score > prev.score) {
          best.set(r.profile_id, { profileId: r.profile_id, score: s.score, distance: null, phashSim: s.phashSim, faceSim: s.faceSim })
        }
      }
    }
    for (const [pid, refs] of refDescs) {
      const r = refs[0].row
      const t = this.rowToToken(r)
      if (!t) continue
      let s = scoreFaceToken(q, t)
      let distance: number | null = null
      if (descriptorMode) {
        const distances = refs.map((ref) => descriptorDistance(desc!, ref.vec)).filter((d): d is number => d !== null)
        if (!distances.length) continue
        const d = Math.min(...distances)
        const goodFace = quality > 0.7
        const limit = goodFace ? DESCRIPTOR_TOLERANCE : PARTIAL_DISTANCE_LIMIT
        let accepted = d <= limit
        if (!accepted && d <= PROFILE_DISTANCE_LIMIT && geom?.length) {
          const g = cosineSim(geom, geomCentroids.get(pid) ?? null)
          accepted = g !== null && g >= GEOMETRY_CORROBORATION
        }
        if (!accepted) continue
        distance = d
        s = { score: Math.round((1 - d) * 1000) / 10, phashSim: s.phashSim, faceSim: Math.round((1 - d) * 50) }
      }
      const prev = best.get(pid)
      if (!prev || s.score > prev.score) {
        best.set(pid, { profileId: pid, score: s.score, distance, phashSim: s.phashSim, faceSim: s.faceSim })
      }
    }
    const ranked = [...best.values()]
      .filter((m) => m.score >= 70 || (m.distance !== null && m.distance <= PROFILE_DISTANCE_LIMIT))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    // If the top two are too close together the identity is ambiguous:
    // downgrade the winner to an uncertain closest, never a named identity.
    if (ranked.length >= 2 && desc?.length) {
      const d0 = 1 - ranked[0].score / 100
      const d1 = 1 - ranked[1].score / 100
      const need = quality > 0.7 ? DESCRIPTOR_MARGIN : PARTIAL_MARGIN
      if (d1 - d0 < need) {
        ranked[0] = { ...ranked[0], score: Math.min(ranked[0].score, 59) }
      }
    }
    return ranked.map((m) => {
      const p = this.db.get<{ full_name: string; profile_code: string; avatar_blob: string | null }>('SELECT full_name, profile_code, avatar_blob FROM profiles WHERE id = ?', [m.profileId])
      return { profileId: m.profileId, score: m.score, distance: m.distance, phashSim: m.phashSim, faceSim: m.faceSim, name: p?.full_name ?? 'Unknown', code: p?.profile_code ?? '', avatar: p?.avatar_blob ?? null }
    })
  }

  private allowedProfileIds(filters: { view?: string; categoryId?: string; country?: string; text?: string }): Set<string> | null {
    const clauses = ['deleted_at IS NULL']
    const params: (string)[] = []
    if (filters.view === 'archived' || filters.view === 'active') {
      clauses.push('status = ?')
      params.push(filters.view)
    }
    if (filters.categoryId) {
      clauses.push('category_id = ?')
      params.push(filters.categoryId)
    }
    if (filters.country) {
      clauses.push('(country LIKE ? OR country_iso2 = ?)')
      params.push(`%${filters.country}%`, filters.country)
    }
    if (filters.text?.trim()) {
      clauses.push('(full_name LIKE ? OR username LIKE ? OR tags_text LIKE ?)')
      params.push(`%${filters.text.trim()}%`, `%${filters.text.trim()}%`, `%${filters.text.trim()}%`)
    }
    const rows = this.db.all<{ id: string }>(`SELECT id FROM profiles WHERE ${clauses.join(' AND ')}`, params)
    return new Set(rows.map((r) => r.id))
  }

  profileTokens(profileId: string): { kind: string; status: string; faceDetected: boolean; phash: string | null }[] {
    return this.db
      .all<TokenRow>('SELECT * FROM photo_tokens WHERE profile_id = ? ORDER BY kind, created_at', [profileId])
      .map((r) => ({ kind: r.kind, status: r.status, faceDetected: r.face_detected === 1, phash: r.phash }))
  }

  saveGeom(profileId: string, geom: number[], kind: 'avatar' | 'gallery' | 'attachment' = 'avatar'): void {
    if (!geom?.length) throw new AppError('VALIDATION', 'Provide face geometry.')
    const r = this.db.get<{ id: string }>('SELECT id FROM photo_tokens WHERE profile_id=? AND status=? AND phash IS NOT NULL ORDER BY (kind=?) DESC, updated_at DESC LIMIT 1', [profileId, 'done', kind])
    if (r?.id) {
      this.db.run('UPDATE photo_tokens SET face_geom=?, face_detected=1, updated_at=? WHERE id=?', [JSON.stringify(geom), new Date().toISOString(), r.id])
    }
  }

  saveDesc(profileId: string, desc: number[], kind: 'avatar' | 'gallery' | 'attachment' = 'avatar', imageId?: string | null): void {
    if (!desc?.length) throw new AppError('VALIDATION', 'Provide a face descriptor.')
    const hasImageScope = kind !== 'avatar' && imageId
    const r = hasImageScope
      ? this.db.get<{ id: string }>('SELECT id FROM photo_tokens WHERE profile_id=? AND image_id=? AND status=? AND phash IS NOT NULL LIMIT 1', [profileId, imageId, 'done'])
      : this.db.get<{ id: string }>('SELECT id FROM photo_tokens WHERE profile_id=? AND status=? AND phash IS NOT NULL ORDER BY (kind=?) DESC, updated_at DESC LIMIT 1', [profileId, 'done', kind])
    if (r?.id) {
      this.db.run('UPDATE photo_tokens SET face_desc=?, face_detected=1, updated_at=? WHERE id=?', [JSON.stringify(desc), new Date().toISOString(), r.id])
    }
  }

  async saveFace(profileId: string, cropDataUrl: string, geom: number[] | null = null, desc: number[] | null = null): Promise<{ tokenId: string }> {
    const p = this.db.get<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = ? AND deleted_at IS NULL', [profileId])
    if (!p) throw new AppError('NOT_FOUND', 'Profile not found.')
    if (!cropDataUrl && !desc?.length) throw new AppError('VALIDATION', 'Provide a face crop.')
    const token = cropDataUrl
      ? await tokenizeImage(cropDataUrl)
      : { phash: '', ahash: '', histogram: [], faceDetected: false, facePhash: null, faceBox: null, faceGeom: null, width: 0, height: 0 }
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO photo_tokens(id, profile_id, image_id, kind, phash, ahash, face_detected, face_phash, face_box, face_geom, face_desc, histogram, status, attempts, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'done', 1, ?, ?)`,
      [id, profileId, null, 'gallery', token.phash || '0'.repeat(16), token.ahash, token.faceDetected ? 1 : 0, token.facePhash, token.faceBox ? JSON.stringify(token.faceBox) : null, geom?.length ? JSON.stringify(geom) : null, desc?.length ? JSON.stringify(desc) : null, JSON.stringify(token.histogram), now, now],
    )
    return { tokenId: id }
  }

  inheritFaceData(newProfileId: string, sourceProfileId: string): { rows: number } {
    if (newProfileId === sourceProfileId) throw new AppError('VALIDATION', 'Source and target must differ.')
    const src = this.db.get<{ id: string }>('SELECT id FROM profiles WHERE id = ?', [sourceProfileId])
    if (!src) throw new AppError('NOT_FOUND', 'Source profile not found.')
    const tgt = this.db.get<{ id: string }>('SELECT id FROM profiles WHERE id = ? AND deleted_at IS NULL', [newProfileId])
    if (!tgt) throw new AppError('NOT_FOUND', 'Target profile not found.')
    const rows = this.db.all<TokenRow>('SELECT * FROM photo_tokens WHERE profile_id = ?', [sourceProfileId])
    const now = new Date().toISOString()
    for (const r of rows) {
      this.db.run(
        `INSERT INTO photo_tokens(id, profile_id, image_id, kind, phash, ahash, face_detected, face_phash, face_box, face_geom, face_desc, histogram, status, attempts, error, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          newProfileId,
          r.image_id,
          r.kind,
          r.phash,
          r.ahash,
          r.face_detected,
          r.face_phash,
          r.face_box,
          r.face_geom,
          (r as TokenRow).face_desc ?? null,
          r.histogram,
          r.status,
          r.attempts,
          r.error,
          now,
          now,
        ],
      )
    }
    return { rows: rows.length }
  }

  async recheck(profileId: string): Promise<{ phash: string; faceDetected: boolean }> {
    const r = this.db.get<{ avatar_blob: string | null }>('SELECT avatar_blob FROM profiles WHERE id = ?', [profileId])
    if (!r?.avatar_blob) throw new AppError('NOT_FOUND', 'Profile has no photograph.')
    const t = await tokenizeImage(r.avatar_blob)
    return { phash: t.phash, faceDetected: t.faceDetected }
  }
}
