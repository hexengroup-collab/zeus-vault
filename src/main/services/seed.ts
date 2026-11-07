import type { Db } from '../db/sqlite'
import { COUNTRIES } from '../../shared/countries'
import type { ProfilesService } from './profiles'
import type { Actor } from './audit'
import type { ProfileInput } from '../../shared/types'

interface DemoSeed {
  name: string
  dob: string
  gender: string
  iso2: string
  city: string
  state: string
  occupation: string
  company: string
  industry: string
  category: string
  tags: string[]
  archived?: boolean
}

// All demonstration records are fictional. Emails use reserved example.com domains;
// phone numbers use the fictional 555-01xx range. No real person is represented.
const DEMO: DemoSeed[] = [
  { name: 'Ethan James Mitchell', dob: '1998-04-12', gender: 'Male', iso2: 'US', city: 'Austin', state: 'Texas', occupation: 'Systems Analyst', company: 'Northwind Traders', industry: 'Technology', category: 'Professional', tags: ['priority', 'vip'] },
  { name: 'Priya Raghavan', dob: '1987-11-03', gender: 'Female', iso2: 'IN', city: 'Bengaluru', state: '', occupation: 'Data Architect', company: 'Coho Pioneer', industry: 'Technology', category: 'Client', tags: ['retainer'] },
  { name: 'Marcus Whitfield', dob: '1975-07-29', gender: 'Male', iso2: 'GB', city: 'London', state: '', occupation: 'Finance Director', company: 'Sterling & Co', industry: 'Finance', category: 'Business', tags: ['q4'] },
  { name: 'Sofia Almeida', dob: '1993-02-18', gender: 'Female', iso2: 'BR', city: 'São Paulo', state: '', occupation: 'Product Designer', company: 'Lumen Studio', industry: 'Design', category: 'Professional', tags: ['design'] },
  { name: 'Jonas Lindqvist', dob: '1982-09-07', gender: 'Male', iso2: 'SE', city: 'Stockholm', state: '', occupation: 'Logistics Manager', company: 'Baltic Freight', industry: 'Logistics', category: 'Business', tags: [] },
  { name: 'Amira Haddad', dob: '1990-06-25', gender: 'Female', iso2: 'AE', city: 'Dubai', state: '', occupation: 'Trade Consultant', company: 'Emirates Gate', industry: 'Trade', category: 'Client', tags: ['priority'] },
  { name: 'Tomás Herrera', dob: '1969-12-01', gender: 'Male', iso2: 'MX', city: 'Mexico City', state: '', occupation: 'Operations Lead', company: 'Azteca Steel', industry: 'Manufacturing', category: 'Business', tags: [] },
  { name: 'Chen Wei-Lin', dob: '1996-03-14', gender: 'Male', iso2: 'SG', city: 'Singapore', state: '', occupation: 'Hardware Engineer', company: 'Meridian Circuits', industry: 'Technology', category: 'Professional', tags: ['hardware'] },
  { name: 'Elena Duarte', dob: '1984-08-19', gender: 'Female', iso2: 'PT', city: 'Lisbon', state: '', occupation: 'Legal Counsel', company: 'Duarte & Associados', industry: 'Legal', category: 'Client', tags: ['legal'] },
  { name: 'David Okafor', dob: '1991-10-30', gender: 'Male', iso2: 'NG', city: 'Lagos', state: '', occupation: 'Agricultural Exporter', company: 'Green Savannah Co-op', industry: 'Agriculture', category: 'Business', tags: [] },
  { name: 'Hana Kobayashi', dob: '2000-01-22', gender: 'Female', iso2: 'JP', city: 'Tokyo', state: '', occupation: 'UX Researcher', company: 'Hikari Interactive', industry: 'Design', category: 'Research', tags: ['research'] },
  { name: 'Liam O’Connor', dob: '1978-05-16', gender: 'Male', iso2: 'IE', city: 'Dublin', state: '', occupation: 'Chartered Accountant', company: 'O’Connor & Burke', industry: 'Finance', category: 'Client', tags: ['q4'] },
  { name: 'Ingrid Sørensen', dob: '1989-04-08', gender: 'Female', iso2: 'DK', city: 'Copenhagen', state: '', occupation: 'Environmental Engineer', company: 'Nordic Renewables', industry: 'Energy', category: 'Professional', tags: ['wind'] },
  { name: 'Rafael Mendoza', dob: '1994-07-11', gender: 'Male', iso2: 'CL', city: 'Santiago', state: '', occupation: 'Mining Analyst', company: 'Andes Mineral', industry: 'Mining', category: 'Research', tags: [], archived: true },
  { name: 'Aisha Rahman', dob: '1999-09-27', gender: 'Female', iso2: 'BD', city: 'Dhaka', state: '', occupation: 'Public Health Analyst', company: 'Delta Health Initiative', industry: 'Healthcare', category: 'Research', tags: ['ngo'] },
  { name: 'Tomasz Nowak', dob: '1972-02-05', gender: 'Male', iso2: 'PL', city: 'Warsaw', state: '', occupation: 'Security Architect', company: 'Vistula Defense Systems', industry: 'Defense', category: 'Business', tags: ['security'] },
  { name: 'Claire Beaumont', dob: '1986-06-13', gender: 'Female', iso2: 'FR', city: 'Lyon', state: '', occupation: 'Logistics Coordinator', company: 'Rhône Freight', industry: 'Logistics', category: 'Contact', tags: [] },
  { name: 'Marco Bellini', dob: '1995-12-08', gender: 'Male', iso2: 'IT', city: 'Milan', state: '', occupation: 'Fashion Buyer', company: 'Bellini Trade Co.', industry: 'Retail', category: 'Contact', tags: ['retail'] },
  { name: 'Grace Mokoena', dob: '1981-03-21', gender: 'Female', iso2: 'ZA', city: 'Johannesburg', state: '', occupation: 'Actuary', company: 'Highveld Insurance', industry: 'Finance', category: 'Client', tags: ['retainer'], archived: true },
  { name: 'Daniel Park', dob: '1997-08-02', gender: 'Male', iso2: 'KR', city: 'Seoul', state: '', occupation: 'Mobile Developer', company: 'Hangang Apps', industry: 'Technology', category: 'Professional', tags: ['mobile'] },
  { name: 'Nora Haddad', dob: '1988-11-17', gender: 'Female', iso2: 'JO', city: 'Amman', state: '', occupation: 'Procurement Officer', company: 'Petra Logistics', industry: 'Trade', category: 'Contact', tags: [] },
  { name: 'Victor Sandoval', dob: '1965-01-09', gender: 'Male', iso2: 'ES', city: 'Madrid', state: '', occupation: 'Retired Diplomat', company: '', industry: '', category: 'Personal', tags: ['personal'], archived: true },
  { name: 'Zara Chowdhury', dob: '2001-05-30', gender: 'Female', iso2: 'BD', city: 'Chattogram', state: '', occupation: 'Graduate Intern', company: 'Bengal Textiles', industry: 'Textiles', category: 'Test Data', tags: ['intern'] },
]

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedDemoProfiles(db: Db, profiles: ProfilesService, categories: { id: string; name: string }[], actor: Actor): number {
  const rand = mulberry32(20261106)
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
  const testCategory = byName.get('test data') ?? null
  const usernameTaken = new Set(db.all<{ username: string }>('SELECT username FROM profiles').map((r) => r.username.toLowerCase()))
  const now = Date.now()
  let count = 0
  for (const seed of DEMO) {
    const parts = seed.name.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
    const base = parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0]
    let username = base.replace(/-/g, '')
    let n = 1
    while (usernameTaken.has(username)) {
      n += 1
      username = `${base}${n}`
    }
    usernameTaken.add(username)

    const country = COUNTRIES.find((c) => c.iso2 === seed.iso2)
    const createdDaysAgo = Math.floor(rand() * 420) + 7
    const createdAt = new Date(now - createdDaysAgo * 86_400_000 - rand() * 86_400_000)
    const updatedAt = new Date(createdAt.getTime() + rand() * Math.min(createdDaysAgo, 60) * 86_400_000)
    const categoryId = byName.get(seed.category.toLowerCase()) ?? testCategory

    const input: ProfileInput = {
      basic: {
        fullName: seed.name,
        username,
        dob: seed.dob,
        gender: seed.gender,
        nationality: country?.name ?? '',
        country: country?.name ?? '',
        countryIso2: seed.iso2,
        state: seed.state,
        city: seed.city,
        preferredLanguage: 'English',
        timezone: 'UTC',
        profileStatus: 'Active',
        categoryId,
        tags: seed.tags,
        notes: 'Fictional demonstration record. Not a real person.',
      },
      contact: {
        primaryPhone: `${country?.dial ?? ''} 555-01${String(100 + count).slice(0, 3)}`.trim(),
        secondaryPhone: '',
        phoneCountryCode: country?.dial ?? '',
        primaryEmail: `${username}@example.com`,
        secondaryEmail: '',
        altEmail: '',
        website: seed.company ? `https://www.example.com/${encodeURIComponent(seed.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}` : '',
        contactPreference: 'Email',
        socialLinks: [],
      },
      address: {
        street: `${100 + Math.floor(rand() * 800)} Meridian Avenue`,
        apartment: rand() > 0.6 ? `Apt ${Math.floor(rand() * 400) + 1}` : '',
        city: seed.city,
        state: seed.state,
        postalCode: String(10000 + Math.floor(rand() * 89999)),
        country: country?.name ?? '',
        countryCode: country?.dial?.replace('+', '') ?? '',
      },
      account: {
        loginUsername: username,
        loginEmail: `${username}@example.net`,
        password: '',
        clearPassword: false,
        accountProvider: 'ExampleID',
        accountCreatedAt: createdAt.toISOString().slice(0, 10),
        lastLogin: updatedAt.toISOString().slice(0, 10),
        status: seed.archived ? 'Closed' : 'Active',
        recoveryInfo: '',
        notes: '',
      },
      professional: {
        occupation: seed.occupation,
        jobTitle: seed.occupation,
        company: seed.company,
        industry: seed.industry,
        website: '',
        workEmail: `${username}@example.org`,
        workPhone: '',
        notes: '',
      },
      custom: {
        fields: [],
        personalNotes: '',
        internalNotes: 'Seeded by Zeus Vault demonstration setup.',
        personalTags: seed.tags,
      },
    }

    const detail = profiles.create(input, { id: actor.id, username: actor.username })
    // Mark as demo and backdate timestamps for a realistic archive
    db.run(`UPDATE profiles SET is_demo = 1, source = 'demo', created_at = ?, updated_at = ? WHERE id = ?`, [
      createdAt.toISOString(),
      updatedAt.toISOString(),
      detail.id,
    ])
    if (seed.archived) {
      db.run(`UPDATE profiles SET status = 'archived', archived_by = ?, archived_at = ? WHERE id = ?`, [actor.username, updatedAt.toISOString(), detail.id])
    }
    profiles.syncFts(detail.id)
    count += 1
  }
  return count
}

export function seedB2bContacts(db: Db, b2b: import('./b2b').B2bService, actor: Actor): number {
  const DEMO_B2B = [
    { companyName: 'Northwind Traders', industry: 'Logistics', website: 'https://www.example.com/northwind', workType: 'Freight forwarding and customs brokerage', contactPerson: 'Dana Whitmore', contactRole: 'Head of Procurement', phone: '+1 202-555-0121', email: 'procurement@example.com', street: '12 Harbor Plaza', city: 'Newark', state: 'New Jersey', postalCode: '07102', country: 'United States', countryIso2: 'US', status: 'Active' as const, notes: 'Fictional B2B demonstration record.' },
    { companyName: 'Sterling & Co Trading', industry: 'Finance', website: 'www.sterling-example.com', workType: 'Import-export financing and letters of credit', contactPerson: 'Oliver Grant', contactRole: 'Trade Finance Manager', phone: '+44 20 5555 0133', email: 'trade.finance@example.co.uk', street: '88 Fenwick Row', city: 'London', state: '', postalCode: 'EC3A 7AB', country: 'United Kingdom', countryIso2: 'GB', status: 'Active' as const, notes: 'Fictional B2B demonstration record.' },
    { companyName: 'Meridian Circuits Pte Ltd', industry: 'Technology', website: 'https://www.example.com/meridian', workType: 'PCB assembly and contract manufacturing', contactPerson: 'Wei Chen', contactRole: 'Operations Director', phone: '+65 6555 0188', email: 'ops@example.com.sg', street: '30 Tuas South Ave', city: 'Singapore', state: '', postalCode: '637020', country: 'Singapore', countryIso2: 'SG', status: 'Lead' as const, notes: 'Fictional B2B demonstration record.' },
    { companyName: 'Rhône Freight SAS', industry: 'Logistics', website: 'www.rhonefreight-example.fr', workType: 'Cross-border freight and cold chain transport', contactPerson: 'Claire Beaumont', contactRole: 'Logistics Coordinator', phone: '+33 4 55 55 01 90', email: 'operations@example.fr', street: '14 Quai du Rhône', city: 'Lyon', state: '', postalCode: '69007', country: 'France', countryIso2: 'FR', status: 'Active' as const, notes: 'Fictional B2B demonstration record.' },
    { companyName: 'Nordic Renewables ApS', industry: 'Energy', website: 'www.nordicrenewables-example.dk', workType: 'Wind turbine maintenance and spare parts', contactPerson: 'Ingrid Sørensen', contactRole: 'Service Manager', phone: '+45 55 55 01 77', email: 'service@example.dk', street: '6 Vindmøllevej', city: 'Copenhagen', state: '', postalCode: '2100', country: 'Denmark', countryIso2: 'DK', status: 'Dormant' as const, notes: 'Fictional B2B demonstration record.' },
    { companyName: 'Vistula Defense Systems', industry: 'Defense', website: 'www.vistula-example.pl', workType: 'Security consulting and systems integration', contactPerson: 'Tomasz Nowak', contactRole: 'Business Development', phone: '+48 22 555 01 44', email: 'bd@example.pl', street: '21 Żelazna', city: 'Warsaw', state: '', postalCode: '00-112', country: 'Poland', countryIso2: 'PL', status: 'Lead' as const, notes: 'Fictional B2B demonstration record.' },
    { companyName: 'Green Savannah Cooperative', industry: 'Agriculture', website: 'www.greensavannah-example.ng', workType: 'Agro-commodity sourcing and export', contactPerson: 'David Okafor', contactRole: 'Export Manager', phone: '+234 1 555 01 66', email: 'export@example.ng', street: '4 Apapa Road', city: 'Lagos', state: '', postalCode: '102273', country: 'Nigeria', countryIso2: 'NG', status: 'Active' as const, notes: 'Fictional B2B demonstration record.' },
    { companyName: 'Andes Mineral Partners', industry: 'Mining', website: 'www.andesmineral-example.cl', workType: 'Ore sampling, assay services and logistics', contactPerson: 'Rafael Mendoza', contactRole: 'Commercial Director', phone: '+56 2 5555 01 88', email: 'commercial@example.cl', street: '270 Calle los Mineros', city: 'Santiago', state: '', postalCode: '8320000', country: 'Chile', countryIso2: 'CL', status: 'Dormant' as const, notes: 'Fictional B2B demonstration record.' },
  ]
  let count = 0
  for (const d of DEMO_B2B) {
    const input: import('../../shared/types').B2bInput = {
      companyName: d.companyName,
      industry: d.industry,
      website: d.website,
      workType: d.workType,
      contactPerson: d.contactPerson,
      contactRole: d.contactRole,
      phone: d.phone,
      email: d.email,
      street: d.street,
      city: d.city,
      state: d.state,
      postalCode: d.postalCode,
      country: d.country,
      countryIso2: d.countryIso2,
      status: d.status,
      notes: d.notes,
      tags: ['demo', 'b2b'],
    }
    try {
      const created = b2b.create(input, actor)
      db.run('UPDATE b2b_contacts SET is_demo = 1 WHERE id = ?', [created.id])
      count += 1
    } catch {
      /* duplicate seed rows are acceptable no-ops */
    }
  }
  return count
}
