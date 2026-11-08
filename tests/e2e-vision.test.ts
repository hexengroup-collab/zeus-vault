// End-to-end: photo upload → token queue → image search → face match →
// aliases → semantic embeddings → export destination presets.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import sharp from 'sharp'
import { Db } from '../src/main/db/sqlite'
import { migrate } from '../src/main/db/schema'
import { SettingsService } from '../src/main/services/settings'
import { AuditService } from '../src/main/services/audit'
import { AuthService } from '../src/main/services/auth'
import { ProfilesService } from '../src/main/services/profiles'
import { CategoriesService } from '../src/main/services/categories'
import { PhotosService } from '../src/main/services/photos'
import { NlpService } from '../src/main/services/nlp'
import { hashPassword } from '../src/main/lib/crypto'
import { presetDir, ensureWritableDir } from '../src/main/lib/vision'
import type { ProfileInput } from '../src/shared/types'

function makeCtx() {
  const db = new Db(':memory:')
  migrate(db)
  const settings = new SettingsService(db)
  const audit = new AuditService(db)
  const auth = new AuthService(db, audit, settings)
  const profiles = new ProfilesService(db, audit, settings, randomBytes(32))
  const categories = new CategoriesService(db, audit)
  const photos = new PhotosService(db)
  const nlp = new NlpService(db)
  categories.seedDefaults('test')
  profiles.photoHook = (pid, iid, kind) => photos.enqueue(pid, iid, kind)
  profiles.photoRemovedHook = (pid, iid, kind) => photos.removeToken(pid, iid, kind)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
     VALUES (?,?,?,?,?,?,?,'admin','active',?,?,?,'{}')`,
    [id, 'admin', 'admin', 'Administrator', 'a@e.com', 'a@e.com', hashPassword('CorrectHorse#9'), now, now, id],
  )
  return { db, settings, audit, auth, profiles, categories, photos, nlp, admin: { id, username: 'admin' } }
}

function input(name: string): ProfileInput {
  return {
    basic: { fullName: name, username: name.toLowerCase().replace(/\s+/g, '.'), dob: '', gender: '', nationality: '', country: 'United States', countryIso2: 'US', state: 'Texas', city: 'Austin', preferredLanguage: 'English', timezone: 'UTC', profileStatus: 'Active', categoryId: null, tags: [], notes: '' },
    contact: { primaryPhone: '', secondaryPhone: '', phoneCountryCode: '', primaryEmail: '', secondaryEmail: '', altEmail: '', website: '', contactPreference: '', socialLinks: [] },
    address: { street: '', apartment: '', city: '', state: '', postalCode: '', country: 'United States', countryCode: '1' },
    account: { loginUsername: '', loginEmail: '', password: '', clearPassword: false, accountProvider: '', accountCreatedAt: '', lastLogin: '', status: '', recoveryInfo: '', notes: '' },
    professional: { occupation: '', jobTitle: '', company: '', industry: '', website: '', workEmail: '', workPhone: '', notes: '' },
    custom: { fields: [], personalNotes: '', internalNotes: '', personalTags: [] },
  }
}

async function imageDataUrl(kind: 'face' | 'object-blue' | 'object-red'): Promise<string> {
  const raw = Buffer.alloc(96 * 96 * 3)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 3
      if (kind === 'face' && x > 28 && x < 68 && y > 22 && y < 66) {
        raw[i] = 219 // skin tone block = face-like region
        raw[i + 1] = 176
        raw[i + 2] = 150
      } else if (kind === 'object-blue') {
        raw[i] = 30
        raw[i + 1] = 80
        raw[i + 2] = 200
      } else if (kind === 'object-red') {
        raw[i] = 200
        raw[i + 1] = 40
        raw[i + 2] = 36
      } else {
        raw[i] = 30
        raw[i + 1] = 30
        raw[i + 2] = 30
      }
    }
  }
  const jpg = await sharp(raw, { raw: { width: 96, height: 96, channels: 3 } }).jpeg().toBuffer()
  return `data:image/jpeg;base64,${jpg.toString('base64')}`
}

async function waitFor(fn: () => boolean, timeoutMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fn()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('timed out waiting for condition')
}

describe('e2e: photo token pipeline', () => {
  let ctx: ReturnType<typeof makeCtx>
  let avatarA: string
  let blueA: string
  let blueB: string
  let redB: string
  let idA: string
  let idB: string
  let catId: string

  beforeAll(async () => {
    ctx = makeCtx()
    avatarA = await imageDataUrl('face')
    blueA = await imageDataUrl('object-blue')
    blueB = await imageDataUrl('object-blue')
    redB = await imageDataUrl('object-red')
    const a = ctx.profiles.create(input('Ada Lovelace'), ctx.admin)
    const b = ctx.profiles.create(input('Grace Hopper'), ctx.admin)
    idA = a.id
    idB = b.id
    ctx.profiles.setAvatar(idA, avatarA, ctx.admin)
    ctx.profiles.setAvatar(idB, blueA, ctx.admin)
    catId = ctx.categories.list()[0].id
    const db = ctx.db
    db.run('UPDATE profiles SET category_id = ? WHERE id = ?', [catId, idA])
  }, 60_000)

  it('tokenizes uploads through the queue', async () => {
    await waitFor(() => ctx.photos.status(ctx.admin).done >= 2)
    const s = ctx.photos.status(ctx.admin)
    expect(s.done).toBeGreaterThanOrEqual(2)
    const tokens = ctx.photos.profileTokens(idA)
    // Canonical pipeline: main tokens are object-level only; face claims
    // come from the renderer's deep descriptor pipeline.
    expect(tokens.find((t) => t.kind === 'avatar')?.status).toBe('done')
    expect(tokens.find((t) => t.kind === 'avatar')?.faceDetected).toBe(false)
  }, 30_000)

  it('finds the same image at ~100% and rejects different images', async () => {
    const same = await ctx.photos.search(blueB)
    expect(same.matches.length).toBeGreaterThanOrEqual(1)
    expect(same.matches[0].profileId).toBe(idB)
    expect(same.matches[0].score).toBeGreaterThan(95)
    const diff = await ctx.photos.search(redB)
    expect(diff.matches.find((m) => m.profileId === idB)?.score ?? 0).toBeLessThan(70)
  }, 30_000)

  it('combines token matching with structured filters', async () => {
    const noFilter = await ctx.photos.search(blueB)
    const filtered = await ctx.photos.search(blueB, { categoryId: catId })
    expect(noFilter.matches.some((m) => m.profileId === idA)).toBe(true)
    expect(filtered.matches.every((m) => m.profileId === idA)).toBe(true)
    const textFiltered = await ctx.photos.search(blueB, { text: 'Grace' })
    expect(textFiltered.matches.some((m) => m.profileId === idB)).toBe(true)
    expect(textFiltered.matches.some((m) => m.profileId === idA)).toBe(false)
  }, 30_000)

  it('identifies a face crop against the archive', async () => {
    const crop = await imageDataUrl('face')
    // Legacy code path (no deep descriptor): perceptual tokens only.
    // The score gate (60) keeps weak perceptuaal candidates out.
    const hits = await ctx.photos.matchFace(crop)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].profileId).toBe(idA)
  }, 30_000)

  it('supports user-editable aliases and semantic search', async () => {
    ctx.nlp.addAlias('telco', 'telecom', ctx.admin)
    expect(ctx.nlp.aliases()).toContainEqual({ alias: 'telco', canonical: 'telecom' })
    ctx.nlp.embedAll()
    const hits = ctx.nlp.semanticSearch('Ada Lovelace')
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].profileId).toBe(idA)
  }, 30_000)

  it('resolves export destination presets to real folders', () => {
    const dir = presetDir('documents', os.tmpdir(), os.tmpdir(), 'exports')
    expect(dir).toContain('Documents')
    const created = ensureWritableDir(dir)
    expect(fs.existsSync(created)).toBe(true)
    const def = presetDir('vault', '/vault/exports', '/vault/backups', 'exports')
    expect(def).toBe('/vault/exports')
  })
})
