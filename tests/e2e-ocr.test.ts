// End-to-end: image upload → attachment tokenization → OCR → document search.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { Db } from '../src/main/db/sqlite'
import { migrate } from '../src/main/db/schema'
import { SettingsService } from '../src/main/services/settings'
import { AuditService } from '../src/main/services/audit'
import { AuthService } from '../src/main/services/auth'
import { ProfilesService } from '../src/main/services/profiles'
import { CategoriesService } from '../src/main/services/categories'
import { PhotosService } from '../src/main/services/photos'
import { DocsService } from '../src/main/services/docs'
import { hashPassword } from '../src/main/lib/crypto'
import type { ProfileInput } from '../src/shared/types'

function makeCtx() {
  const db = new Db(':memory:')
  migrate(db)
  const settings = new SettingsService(db)
  const audit = new AuditService(db)
  new AuthService(db, audit, settings)
  const profiles = new ProfilesService(db, audit, settings, randomBytes(32))
  const categories = new CategoriesService(db, audit)
  const photos = new PhotosService(db)
  const docs = new DocsService(db)
  categories.seedDefaults('test')
  profiles.photoHook = (pid, iid, kind) => photos.enqueue(pid, iid, kind)
  profiles.photoRemovedHook = (pid, iid, kind) => photos.removeToken(pid, iid, kind)
  profiles.ocrHook = (aid, pid) => docs.enqueue(aid, pid)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
     VALUES (?,?,?,?,?,?,?,'admin','active',?,?,?,'{}')`,
    [id, 'admin', 'admin', 'Admin', 'a@e.com', 'a@e.com', hashPassword('CorrectHorse#9'), now, now, id],
  )
  return { db, profiles, photos, docs, admin: { id, username: 'admin' } }
}

function input(name: string): ProfileInput {
  return {
    basic: { fullName: name, username: name.toLowerCase().replace(/\s+/g, '.'), dob: '', gender: '', nationality: '', country: 'United States', countryIso2: 'US', state: '', city: '', preferredLanguage: 'English', timezone: 'UTC', profileStatus: 'Active', categoryId: null, tags: [], notes: '' },
    contact: { primaryPhone: '', secondaryPhone: '', phoneCountryCode: '', primaryEmail: '', secondaryEmail: '', altEmail: '', website: '', contactPreference: '', socialLinks: [] },
    address: { street: '', apartment: '', city: '', state: '', postalCode: '', country: 'United States', countryCode: '1' },
    account: { loginUsername: '', loginEmail: '', password: '', clearPassword: false, accountProvider: '', accountCreatedAt: '', lastLogin: '', status: '', recoveryInfo: '', notes: '' },
    professional: { occupation: '', jobTitle: '', company: '', industry: '', website: '', workEmail: '', workPhone: '', notes: '' },
    custom: { fields: [], personalNotes: '', internalNotes: '', personalTags: [] },
  }
}

describe('e2e: attachments scan + OCR', () => {
  let ctx: ReturnType<typeof makeCtx>
  let pid: string

  beforeAll(async () => {
    ctx = makeCtx()
    pid = ctx.profiles.create(input('Ada Lovelace'), ctx.admin).id
  }, 60_000)

  it('tokenizes image attachments', async () => {
    const svg = Buffer.from(`<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200" fill="navy"/></svg>`)
    const jpg = await sharp(svg).jpeg().toBuffer()
    const dataUrl = `data:image/jpeg;base64,${jpg.toString('base64')}`
    const attId = ctx.profiles.addAttachment(pid, 'navy-scan.jpg', 'image/jpeg', dataUrl, 'documents', ctx.admin)
    const deadline = Date.now() + 15000
    let done = 0
    while (Date.now() < deadline) {
      const toks = ctx.photos.profileTokens(pid)
      done = toks.filter((t) => t.status === 'done').length
      if (done >= 1) break
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(done).toBeGreaterThanOrEqual(1)
    expect(attId).toBeTruthy()
  }, 30_000)

  it('OCRs uploaded images and finds them by text', async () => {
    const svg = Buffer.from(`<svg width="440" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="440" height="120" fill="white"/><text x="20" y="75" font-size="42" font-family="monospace" fill="black">CASE 407</text></svg>`)
    const jpg = await sharp(svg).jpeg().toBuffer()
    const dataUrl = `data:image/jpeg;base64,${jpg.toString('base64')}`
    ctx.profiles.addAttachment(pid, 'case-notes.jpg', 'image/jpeg', dataUrl, 'documents', ctx.admin)
    const hits = ctx.docs.search('CASE')
    expect(hits.length).toBeGreaterThanOrEqual(0)
    // OCR is queued; give the drain a chance.
    const deadline = Date.now() + 30000
    let found = ctx.docs.search('CASE')
    while (Date.now() < deadline && found.length === 0) {
      await new Promise((r) => setTimeout(r, 250))
      found = ctx.docs.search('CASE')
    }
    expect(found.some((h) => h.profileId === pid)).toBe(true)
  }, 60_000)
})
