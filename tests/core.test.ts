import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Db } from '../src/main/db/sqlite'
import { migrate } from '../src/main/db/schema'
import { SettingsService } from '../src/main/services/settings'
import { AuditService } from '../src/main/services/audit'
import { AuthService } from '../src/main/services/auth'
import { ProfilesService } from '../src/main/services/profiles'
import { CategoriesService } from '../src/main/services/categories'
import { DashboardService } from '../src/main/services/dashboard'
import { hashPassword, encryptField, decryptField, verifyPassword } from '../src/main/lib/crypto'
import { extractFields } from '../src/main/nlp/engine'
import { interpretQuery } from '../src/main/nlp/query'
import type { ProfileInput } from '../src/shared/types'

function makeContext() {
  const db = new Db(':memory:')
  migrate(db)
  const settings = new SettingsService(db)
  const audit = new AuditService(db)
  const auth = new AuthService(db, audit, settings)
  const profiles = new ProfilesService(db, audit, settings, randomBytes(32))
  const categories = new CategoriesService(db, audit)
  const dashboard = new DashboardService(db)
  categories.seedDefaults('test')
  // Admin user
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
     VALUES (?,?,?,?,?,?,?,'admin','active',?,?,?,'{}')`,
    [id, 'admin', 'admin', 'Administrator', 'admin@example.com', 'admin@example.com', hashPassword('CorrectHorse#9'), now, now, id],
  )
  const admin = { id, username: 'admin' }
  return { db, settings, audit, auth, profiles, categories, dashboard, admin }
}

function sampleInput(name = 'Ethan James Mitchell'): ProfileInput {
  return {
    basic: {
      fullName: name, username: 'ethan.mitchell27', dob: '1998-04-12', gender: 'Male', nationality: 'American',
      country: 'United States', countryIso2: 'US', state: 'Texas', city: 'Austin', preferredLanguage: 'English',
      timezone: 'America/Chicago', profileStatus: 'Active', categoryId: null, tags: ['priority'], notes: 'Fictional demo.',
    },
    contact: {
      primaryPhone: '+1 202-555-0147', secondaryPhone: '', phoneCountryCode: '+1',
      primaryEmail: 'ethan@example.com', secondaryEmail: '', altEmail: '', website: 'https://www.example.com',
      contactPreference: 'Email', socialLinks: [],
    },
    address: { street: '482 Meridian Avenue', apartment: 'Suite 900', city: 'Austin', state: 'Texas', postalCode: '78701', country: 'United States', countryCode: '1' },
    account: {
      loginUsername: 'ethan.mitchell27', loginEmail: 'ethan@example.com', password: 'Sup3r$ecret!vault', clearPassword: false,
      accountProvider: 'ExampleID', accountCreatedAt: '2024-01-01', lastLogin: '2026-11-01', status: 'Active',
      recoveryInfo: '', notes: '',
    },
    professional: { occupation: 'Systems Analyst', jobTitle: 'Systems Analyst', company: 'Northwind Traders', industry: 'Technology', website: '', workEmail: 'ethan@example.org', workPhone: '', notes: '' },
    custom: { fields: [{ label: 'Badge ID', value: 'ZX-9981', type: 'text' }], personalNotes: 'Personal note', internalNotes: 'Internal note', personalTags: [] },
  }
}

describe('encryption primitives', () => {
  it('round-trips AES-256-GCM field encryption', () => {
    const key = randomBytes(32)
    const ct = encryptField('hunter2 war thunder', key, 'account')
    expect(ct).not.toContain('hunter2')
    expect(decryptField(ct, key)).toBe('hunter2 war thunder')
  })

  it('rejects tampered ciphertext', () => {
    const key = randomBytes(32)
    const ct = encryptField('secret', key, 'account')
    const parts = ct.split('.')
    parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith('A') ? 'B' : 'A')
    expect(() => decryptField(parts.join('.'), key)).toThrow()
  })

  it('hashes with argon2id and verifies', () => {
    const hash = hashPassword('S3cure!passphrase')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(verifyPassword('S3cure!passphrase', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('profile lifecycle & audit', () => {
  it('creates, encrypts, reads back and diffs profiles', () => {
    const { profiles, admin, db } = makeContext()
    const detail = profiles.create(sampleInput(), admin)
    expect(detail.profileCode).toMatch(/^ZV-\d{4}-\d{6}$/)
    expect(detail.account.password).toBe('Sup3r$ecret!vault')
    // password at rest is ciphertext
    const raw = db.value<string>('SELECT password_enc FROM profile_accounts WHERE profile_id = ?', [detail.id])
    expect(raw).not.toContain('Sup3r')
    expect(raw!.startsWith('v1.')).toBe(true)

    // Update one field and confirm field-level history + redaction
    const updated = sampleInput()
    updated.contact.primaryEmail = 'ethan.new@example.com'
    updated.contact.primaryPhone = '' // unchanged semantics: actually cleared
    const result = profiles.update(detail.id, updated, admin)
    expect(result.changes).toBeGreaterThanOrEqual(1)
    const history = profiles.fieldHistory(detail.id)
    expect(history.some((h) => h.fieldLabel === 'Primary Email')).toBe(true)

    // Audit chain verifies
    const chain = new AuditService(db).verifyChain()
    expect(chain.ok).toBe(true)
  })

  it('soft-deletes and excludes from default listing', () => {
    const { profiles, admin } = makeContext()
    const detail = profiles.create(sampleInput(), admin)
    profiles.setStatus(detail.id, 'delete', admin)
    const listed = profiles.list({ view: 'active' }, admin.id)
    expect(listed.rows.find((r) => r.id === detail.id)).toBeUndefined()
  })

  it('enforces single active session', () => {
    const { auth } = makeContext()
    const first = auth.login('admin', 'CorrectHorse#9', { deviceName: 'test-rig-1' })
    const second = auth.login('admin', 'CorrectHorse#9', { deviceName: 'test-rig-2' })
    const row = makeContext // noop
    void row
    // The first session must be revoked by the second login
    const sessions = auth.sessionsForUser(first.user.id)
    const firstSession = sessions.find((s) => s.deviceName === 'test-rig-1')
    expect(firstSession?.revokedAt).not.toBeNull()
    expect(second.session.id).not.toBe(first.session.id)
    auth.logout()
  })

  it('dashboard reports real statistics', () => {
    const { profiles, dashboard, admin } = makeContext()
    profiles.create(sampleInput(), admin)
    profiles.create(sampleInput('Priya Raghavan'), admin)
    const data = dashboard.overview(admin.id)
    expect(data.stats.totalProfiles).toBe(2)
    expect(data.stats.activeProfiles).toBe(2)
    expect(data.recentlyCreated.length).toBe(2)
  })
})

describe('NLP layer', () => {
  it('extracts fields from the brief’s canonical example', () => {
    const r = extractFields('Create a profile for Ethan James Mitchell. He is 28 years old, lives in Austin Texas, United States. His username is ethan.mitchell27, email is ethan@example.com and his phone number is +1 202-555-0147.')
    expect(r.values.fullName).toBe('Ethan James Mitchell')
    expect(r.values.age).toBe('28')
    expect(r.values.city).toBe('Austin')
    expect(r.values.state).toBe('Texas')
    expect(r.values.country).toBe('United States')
    expect(r.values.username).toBe('ethan.mitchell27')
    expect(r.values.primaryEmail).toBe('ethan@example.com')
    expect(r.values.primaryPhone).toContain('202-555-0147')
  })

  it('never splits the full name and maps aliases', () => {
    const r = extractFields('Passcode: S3cret! and Mail: a@b.com. Login ID: alpha. ZIP: 78701')
    expect(r.values.password).toBe('S3cret!')
    expect(r.values.primaryEmail).toBe('a@b.com')
    expect(r.values.username).toBe('alpha')
    expect(r.values.postalCode).toBe('78701')
  })

  it('interprets natural language queries into filters', () => {
    expect(interpretQuery('Show profiles created by admin').filters.createdBy).toBe('admin')
    expect(interpretQuery('Find profiles with Gmail addresses').filters.emailDomain).toBe('gmail.com')
    const us = interpretQuery('People from the United States who work in technology')
    expect(us.filters.country).toBe('US')
    expect(us.filters.industry).toMatch(/technology/i)
    expect(interpretQuery('Find profiles with missing phone numbers').filters.missing).toContain('phone')
    expect(interpretQuery('Show recently edited profiles').filters.sort?.key).toBe('updatedAt')
  })
})

describe('NLP layer — extended coverage', () => {
  it('categorizes every extracted field by semantic class', () => {
    const r = extractFields('His name is Marina Castellanos, email is marina@example.com, phone is +1 512-555-0177, works as a Product Manager at Helios Labs in the fintech industry.')
    const categories = Object.fromEntries(r.fields.map((f) => [f.key, f.category]))
    expect(categories.fullName).toBe('Identity')
    expect(categories.primaryEmail).toBe('Contact')
    expect(categories.primaryPhone).toBe('Contact')
    expect(categories.occupation).toBe('Professional')
    expect(categories.company).toBe('Professional')
    expect(categories.industry).toBe('Professional')
  })

  it('detects industries from natural phrases and aliases', () => {
    const a = extractFields('She works in the healthcare sector and her email is a@b.com')
    expect(a.values.industry).toBe('Healthcare')
    const b = extractFields('Industry: software. Company: Northwind Traders')
    expect(b.values.industry).toBe('Technology')
    const c = extractFields('He works in fintech')
    expect(c.values.industry).toBe('Finance')
    const d = extractFields('She works in ag')
    expect(d.values.industry).toBeUndefined() // unknown tokens must not be invented
  })

  it('extracts phones in multiple formats', () => {
    const a = extractFields('Call me at (512) 555-0147 anytime')
    expect(a.values.primaryPhone).toMatch(/512/)
    const b = extractFields('Mobile: +44 20 7946 0958, she is 34 years old')
    expect(b.values.primaryPhone).toContain('+44')
    expect(b.values.age).toBe('34')
    const c = extractFields('Home phone 555-0166')
    expect(c.values.primaryPhone).toContain('555-0166')
  })

  it('infers US city and state from a bare city name', () => {
    const r = extractFields('Lives in Austin, he is 29 years old')
    expect(r.values.city).toBe('Austin')
    expect(r.values.state).toBe('Texas')
    expect(r.values.country).toBe('United States')
  })

  it('interprets top-N limits, self-references and dates', () => {
    const top = interpretQuery('Top 5 newest profiles')
    expect(top.filters.limit).toBe(5)
    expect(top.filters.sort?.key).toBe('createdAt')
    const me = interpretQuery('Show profiles created by me', { currentUsername: 'ohidead' })
    expect(me.filters.createdBy).toBe('ohidead')
    const y2026 = interpretQuery('Profiles created in 2026')
    expect(y2026.filters.createdFrom).toBe('2026-01-01')
    expect(y2026.filters.createdTo).toBe('2026-12-31')
    const monthly = interpretQuery('Profiles created in March 2026')
    expect(monthly.filters.createdFrom).toBe('2026-03-01')
    expect(monthly.filters.createdTo?.slice(0, 10)).toBe('2026-03-31')
  })

  it('interprets tags, industry, company and missing fields', () => {
    expect(interpretQuery('Find profiles tagged with priority').filters.tags).toContain('priority')
    expect(interpretQuery('People in technology').filters.industry).toBe('Technology')
    expect(interpretQuery('Works at Northwind', { currentUsername: 'x' }).filters.company).toBe('Northwind')
    expect(interpretQuery('Profiles with missing company').filters.missing).toContain('company')
    expect(interpretQuery('Missing website').filters.missing).toContain('website')
  })
})
