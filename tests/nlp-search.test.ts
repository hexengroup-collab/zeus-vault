// Text+NLP search: alias expansion + tolerant free-text recall.
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Db } from '../src/main/db/sqlite'
import { migrate } from '../src/main/db/schema'
import { SettingsService } from '../src/main/services/settings'
import { AuditService } from '../src/main/services/audit'
import { AuthService } from '../src/main/services/auth'
import { ProfilesService } from '../src/main/services/profiles'
import { CategoriesService } from '../src/main/services/categories'
import { NlpService } from '../src/main/services/nlp'
import { SearchService } from '../src/main/services/search'
import { applyUserAliases } from '../src/main/nlp/engine'
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
  categories.seedDefaults('test')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
     VALUES (?,?,?,?,?,?,?,'admin','active',?,?,?,'{}')`,
    [id, 'admin', 'admin', 'Admin', 'a@e.com', 'a@e.com', hashPassword('CorrectHorse#9'), now, now, id],
  )
  const admin = { id, username: 'admin' }
  const search = new SearchService(db, profiles)
  const nlp = new NlpService(db)
  return { db, profiles, search, nlp, admin }
}

function input(name: string, country = 'Bangladesh', iso = 'BD'): ProfileInput {
  return {
    basic: { fullName: name, username: name.toLowerCase().replace(/\s+/g, '.'), dob: '', gender: '', nationality: '', country, countryIso2: iso, state: 'Dhaka', city: 'Dhaka', preferredLanguage: 'Bengali', timezone: 'UTC', profileStatus: 'Active', categoryId: null, tags: [], notes: '' },
    contact: { primaryPhone: '', secondaryPhone: '', phoneCountryCode: '', primaryEmail: '', secondaryEmail: '', altEmail: '', website: '', contactPreference: '', socialLinks: [] },
    address: { street: '', apartment: '', city: '', state: '', postalCode: '', country, countryCode: '880' },
    account: { loginUsername: '', loginEmail: '', password: '', clearPassword: false, accountProvider: '', accountCreatedAt: '', lastLogin: '', status: '', recoveryInfo: '', notes: '' },
    professional: { occupation: '', jobTitle: '', company: '', industry: 'Technology', website: '', workEmail: '', workPhone: '', notes: '' },
    custom: { fields: [], personalNotes: '', internalNotes: '', personalTags: [] },
  }
}

describe('nlp search resilience', () => {
  it('tolerates an unknown word in free text (OR recall)', () => {
    const { profiles, admin } = makeCtx()
    profiles.create(input('Aisha Khan'), admin)
    profiles.create(input('Rahim Uddin'), admin)
    const r = profiles.list({ search: 'Aisha unknownword', view: 'all-status' }, admin.id)
    expect(r.total).toBe(1)
    expect(r.rows[0].fullName).toContain('Aisha')
  })

  it('understands natural-language industry + country queries', () => {
    const { search, admin } = makeCtx()
    // Seed via profiles through a fresh ctx is not possible here; search only.
    const r = search.search('people from Bangladesh who work in technology', 1, 50, admin)
    expect(r.interpretation.filters.country).toBe('BD')
    expect(r.interpretation.filters.industry).toBeTruthy()
  })

  it('translates user aliases into canonical search terms', () => {
    const m = new Map([['telco', 'telecom']])
    expect(applyUserAliases('people telco', m)).toContain('telecom')
  })
})
