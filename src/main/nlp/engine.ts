import { COUNTRIES } from '../../shared/countries'
import { findRegion } from '../../shared/locations'
import { LANGUAGES, TIMEZONES } from '../../shared/constants'
import type { ExtractedField, NlpExtractResult } from '../../shared/types'

export type Confidence = 'certain' | 'inferred' | 'uncertain'
export type FieldCategory = 'Identity' | 'Address' | 'Contact' | 'Professional' | 'Account' | 'Meta' | 'Tags' | 'Notes'

export interface AliasDef {
  key: string
  label: string
  aliases: string[]
  category: FieldCategory
}

export const FIELD_ALIASES: AliasDef[] = [
  { key: 'fullName', label: 'Full Name', aliases: ['full name', 'fullname', 'name', 'dossier name', 'subject name', 'person', 'individual'], category: 'Identity' },
  { key: 'username', label: 'Username', aliases: ['username', 'user name', 'user id', 'userid', 'login id', 'login-id', 'login username', 'handle', 'screen name'], category: 'Identity' },
  { key: 'primaryEmail', label: 'Primary Email', aliases: ['email address', 'email', 'e-mail', 'mail', 'primary email', 'email id', 'email-id', 'email address is'], category: 'Contact' },
  { key: 'secondaryEmail', label: 'Secondary Email', aliases: ['secondary email', 'second email', 'alternate email', 'alt email', 'other email', 'work email'], category: 'Contact' },
  { key: 'primaryPhone', label: 'Primary Phone', aliases: ['phone number', 'phone', 'mobile number', 'mobile', 'cell number', 'cell', 'telephone', 'telephone number', 'contact number', 'primary phone', 'phone no', 'phone#'], category: 'Contact' },
  { key: 'secondaryPhone', label: 'Secondary Phone', aliases: ['secondary phone', 'second phone', 'alternate phone', 'alt phone', 'other phone', 'work phone', 'office phone', 'landline'], category: 'Contact' },
  { key: 'dob', label: 'Date of Birth', aliases: ['date of birth', 'dob', 'birth date', 'birthdate', 'born on', 'born', 'date of birth is'], category: 'Identity' },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'], category: 'Identity' },
  { key: 'nationality', label: 'Nationality', aliases: ['nationality'], category: 'Identity' },
  { key: 'country', label: 'Country', aliases: ['country of origin', 'country', 'nation', 'lives in country'], category: 'Address' },
  { key: 'phoneCountryCode', label: 'Phone Country Code', aliases: ['dialing code', 'dialling code', 'dial code', 'phone code', 'country code', 'calling code'], category: 'Contact' },
  { key: 'state', label: 'State / Province', aliases: ['state', 'province', 'region'], category: 'Address' },
  { key: 'city', label: 'City', aliases: ['city', 'town', 'home town'], category: 'Address' },
  { key: 'postalCode', label: 'ZIP / Postal Code', aliases: ['zip code', 'zip', 'postal code', 'postcode', 'post code', 'pin code'], category: 'Address' },
  { key: 'street', label: 'Street Address', aliases: ['street address', 'street', 'address line 1', 'mailing address', 'address'], category: 'Address' },
  { key: 'apartment', label: 'Apartment / Suite', aliases: ['apartment', 'suite', 'apt', 'unit'], category: 'Address' },
  { key: 'preferredLanguage', label: 'Preferred Language', aliases: ['preferred language', 'language', 'speaks'], category: 'Identity' },
  { key: 'timezone', label: 'Timezone', aliases: ['timezone', 'time zone', 'tz'], category: 'Identity' },
  { key: 'profileStatus', label: 'Profile Status', aliases: ['profile status', 'record status'], category: 'Meta' },
  { key: 'occupation', label: 'Occupation', aliases: ['occupation', 'profession', 'job', 'works as', 'working as', 'he works as', 'she works as'], category: 'Professional' },
  { key: 'jobTitle', label: 'Job Title', aliases: ['job title', 'title', 'position', 'role', 'designation'], category: 'Professional' },
  { key: 'company', label: 'Company', aliases: ['company', 'employer', 'works at', 'works for', 'employed by', 'organization', 'organisation', 'firm', 'startup'], category: 'Professional' },
  { key: 'industry', label: 'Industry', aliases: ['industry', 'sector', 'field', 'domain'], category: 'Professional' },
  { key: 'website', label: 'Website', aliases: ['website', 'web site', 'site', 'homepage', 'url', 'web'], category: 'Contact' },
  { key: 'loginUsername', label: 'Login Username', aliases: ['login', 'login username', 'account username'], category: 'Account' },
  { key: 'loginEmail', label: 'Login Email', aliases: ['login email', 'account email', 'sign-in email'], category: 'Account' },
  { key: 'password', label: 'Password', aliases: ['password', 'passcode', 'pass', 'passphrase', 'credential'], category: 'Account' },
  { key: 'accountProvider', label: 'Account Provider', aliases: ['account provider', 'provider', 'account on', 'platform'], category: 'Account' },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'memo', 'remarks'], category: 'Notes' },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'tagged as', 'tagged', 'labels'], category: 'Tags' },
  { key: 'category', label: 'Category', aliases: ['category', 'classification', 'record type'], category: 'Meta' },
]

// Extra vocabulary merged into existing fields (wider deterministic coverage).
const VOCAB_EXTRA: Record<string, string[]> = {
  fullName: ['client name', 'subject', 'contact name', 'partner name', 'stakeholder name', 'candidate name', 'beneficiary name'],
  jobTitle: ['chief', 'senior', 'junior', 'head of', 'managing director', 'ceo', 'founder', 'co-founder', 'owner', 'chairman', 'partner', 'director', 'manager', 'consultant', 'advocate', 'attorney', 'lawyer', 'accountant', 'engineer', 'developer', 'designer', 'analyst', 'researcher', 'investigator', 'auditor', 'recruiter', 'journalist', 'professor', 'diplomat', 'senator', 'minister'],
  industry: ['technology', 'finance', 'banking', 'insurance', 'healthcare', 'health care', 'education', 'construction', 'logistics', 'transport', 'energy', 'oil and gas', 'mining', 'agriculture', 'food', 'beverage', 'retail', 'hospitality', 'tourism', 'media', 'entertainment', 'law', 'legal', 'accounting', 'consulting', 'manufacturing', 'pharmaceutical', 'real estate', 'automotive', 'telecom', 'telecommunications', 'government', 'ngo', 'charity', 'defense', 'security', 'cyber security', 'fashion', 'pharma', 'tech', 'it', 'information technology'],
  company: ['limited', 'ltd', 'inc', 'llc', 'corp', 'corporation', 'plc', 'group', 'holdings', 'enterprises', 'international'],
  website: ['linkedin', 'linkdin', 'twitter', 'facebook', 'instagram', 'github'],
  dob: ['birthday', 'date-of-birth', 'd.o.b', 'born in', 'age is', 'years old'],
  country: ['hometown', 'resident of'],
  primaryPhone: ['whatsapp', 'call me on', 'cell phone', 'mobile no', 'phone no is'],
  primaryEmail: ['gmail', 'outlook', 'yahoo', 'reach me via email'],
}
for (const def of FIELD_ALIASES) {
  const extra = VOCAB_EXTRA[def.key]
  if (extra) for (const a of extra) if (!def.aliases.includes(a)) def.aliases.push(a)
}

export function applyUserAliases(text: string, aliases: ReadonlyMap<string, string>): string {
  let out = text.toLowerCase()
  const keys = [...aliases.keys()].sort((a, b) => b.length - a.length)
  for (const k of keys) {
    const canonical = aliases.get(k)
    if (canonical) out = out.split(k).join(canonical.toLowerCase())
  }
  return out
}

const CATEGORY_BY_KEY: Record<string, FieldCategory> = Object.fromEntries(FIELD_ALIASES.map((a) => [a.key, a.category]))

const LOCATION_PREPOSITIONS = ['lives in', 'living in', 'based in', 'resides in', 'residing in', 'located in', 'from', 'in', 'near']

const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[•◦▪]/g, ';')
}

function segments(text: string): string[] {
  return normalizeNewlines(text)
    .split(/[\n;]/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/))
    .map((s) => s.trim().replace(/^[-*\d.)]+\s*/, ''))
    .filter(Boolean)
}

function aliasPattern(alias: string): RegExp {
  return new RegExp(
    `(?:^|[\\s,])(?:his|her|their|the)?\\s*${escapeReg(alias)}\\s*(?:is|are|:|=| - |-)\\s*["']?([^"'\\n;,]+?)["']?(?=$|[,;\\n]|(?<=[^\\s])\\.(?=\\s|$)|\\s+(?:and|his|her|their|who|whose|with|that|which|plus|also)\\b)`,
    'i',
  )
}

// Major US cities mapped to their states. Used to infer state when only a city is given.
const CITY_STATE: Record<string, string> = {
  'new york': 'New York', 'los angeles': 'California', 'chicago': 'Illinois', 'houston': 'Texas',
  'phoenix': 'Arizona', 'philadelphia': 'Pennsylvania', 'san antonio': 'Texas', 'san diego': 'California',
  'dallas': 'Texas', 'san jose': 'California', 'austin': 'Texas', 'jacksonville': 'Florida',
  'fort worth': 'Texas', 'columbus': 'Ohio', 'charlotte': 'North Carolina', 'san francisco': 'California',
  'indianapolis': 'Indiana', 'seattle': 'Washington', 'denver': 'Colorado', 'boston': 'Massachusetts',
  'nashville': 'Tennessee', 'baltimore': 'Maryland', 'las vegas': 'Nevada', 'portland': 'Oregon',
  'miami': 'Florida', 'atlanta': 'Georgia', 'minneapolis': 'Minnesota', 'phoenix metro': 'Arizona',
  'detroit': 'Michigan', 'pittsburgh': 'Pennsylvania', 'st louis': 'Missouri', 'st. louis': 'Missouri',
  'kansas city': 'Missouri', 'sacramento': 'California', 'raleigh': 'North Carolina', 'tampa': 'Florida',
  'orlando': 'Florida', 'cleveland': 'Ohio', 'cincinnati': 'Ohio', 'milwaukee': 'Wisconsin',
  'new orleans': 'Louisiana', 'honolulu': 'Hawaii', 'anchorage': 'Alaska', 'salt lake city': 'Utah',
  'washington': 'District of Columbia', 'boise': 'Idaho', 'richmond': 'Virginia', 'jackson': 'Mississippi',
}

const INDUSTRY_ALIASES: Record<string, string> = {
  tech: 'Technology', technology: 'Technology', software: 'Technology', it: 'Technology', internet: 'Technology',
  web: 'Technology', saas: 'Technology', cybersecurity: 'Technology', ai: 'Technology', 'artificial intelligence': 'Technology',
  finance: 'Finance', financial: 'Finance', banking: 'Finance', fintech: 'Finance', investment: 'Finance',
  accounting: 'Finance', insurance: 'Insurance',
  healthcare: 'Healthcare', health: 'Healthcare', medical: 'Healthcare', hospital: 'Healthcare',
  pharma: 'Healthcare', pharmaceuticals: 'Healthcare', biotech: 'Healthcare',
  logistics: 'Logistics', 'supply chain': 'Logistics', shipping: 'Logistics', freight: 'Logistics',
  transport: 'Logistics', transportation: 'Logistics',
  energy: 'Energy', power: 'Energy', utilities: 'Energy', solar: 'Energy', wind: 'Energy', oil: 'Energy', gas: 'Energy',
  agriculture: 'Agriculture', agro: 'Agriculture', farming: 'Agriculture', agribusiness: 'Agriculture',
  manufacturing: 'Manufacturing', industrial: 'Manufacturing',
  retail: 'Retail', 'e-commerce': 'Retail', ecommerce: 'Retail',
  construction: 'Construction', 'real estate': 'Real Estate',
  education: 'Education', edtech: 'Education', training: 'Education',
  government: 'Government', 'public sector': 'Government', municipal: 'Government',
  defense: 'Defense', military: 'Defense', security: 'Defense',
  mining: 'Mining',
  textiles: 'Textiles', garment: 'Textiles',
  aviation: 'Aviation', aerospace: 'Aviation',
  telecom: 'Telecommunications', telecommunications: 'Telecommunications',
  hospitality: 'Hospitality', hotel: 'Hospitality', tourism: 'Hospitality',
  legal: 'Legal', law: 'Legal',
  consulting: 'Consulting', advisory: 'Consulting',
  media: 'Media', entertainment: 'Media',
  automotive: 'Automotive',
}

export function normalizeIndustry(raw: string): string {
  const clean = raw
    .toLowerCase()
    .replace(/\b(the|an|a|industry|sector|domain|field)\b/g, ' ')
    .replace(/[^a-z &-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  if (INDUSTRY_ALIASES[clean]) return INDUSTRY_ALIASES[clean]
  for (const [alias, canonical] of Object.entries(INDUSTRY_ALIASES)) {
    if (alias.includes(' ') && clean.includes(alias)) return canonical
    if (new RegExp(`\\b${escapeReg(alias)}\\b`).test(clean)) return canonical
  }
  return ''
}

export function extractFields(raw: string): NlpExtractResult {
  const text = raw.trim()
  const values = new Map<string, { value: string; confidence: Confidence; label: string; category: FieldCategory }>()
  const warnings: string[] = []
  const setValue = (key: string, label: string, value: string, confidence: Confidence, category?: FieldCategory) => {
    const v = value.trim().replace(/[.,;:\s]+$/, '').trim()
    if (!v) return
    const cat = category ?? CATEGORY_BY_KEY[key] ?? 'Identity'
    const existing = values.get(key)
    if (existing) {
      if (confidence === 'certain' && existing.confidence !== 'certain') values.set(key, { value: v, confidence, label, category: cat })
      return
    }
    values.set(key, { value: v, confidence, label, category: cat })
  }

  let working = text

  // Strip leading creation command and capture the name that follows it
  const createMatch = /^[\s,]*(?:please\s+)?(?:create|add|new|register|set\s?up|setup|open)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:profile|dossier|record|entry)\s*(?:for|of|on)?\s*/i.exec(working)
  if (createMatch) {
    const rest = working.slice(createMatch[0].length)
    const nameMatch = /^([A-Za-z][A-Za-z'' .-]{2,60}?)(?=\s*[.,;]|\s+(?:he|she|they|who|is|age|aged|email|phone|username|lives|based|born|from|with|at|works)\b|$)/i.exec(rest)
    if (nameMatch) {
      setValue('fullName', 'Full Name', nameMatch[1], 'certain')
      working = rest.slice(Math.min(nameMatch[0].length, rest.length)).replace(/^[\s,.;]+/, '')
      if (!working) working = rest
    }
  }

  const segs = segments(working)

  // Pass 1: alias key/value extraction
  for (const seg of segs) {
    for (const def of FIELD_ALIASES) {
      for (const alias of def.aliases) {
        const m = aliasPattern(alias).exec(seg)
        if (!m) continue
        let value = m[1].trim()
        if (def.key === 'occupation') value = value.split(/\s+at\s+/i)[0].trim()
        if (def.key === 'dob') value = normalizeDate(value, warnings)
        if (def.key === 'industry') value = normalizeIndustry(value)
        if (def.key === 'tags') {
          setValue('tags', 'Tags', value.split(/[,]/).map((t) => t.trim()).filter(Boolean).join(', '), 'certain', 'Tags')
          continue
        }
        if (def.key === 'country') {
          const c = matchCountry(value)
          if (c) {
            setValue('country', 'Country', c.name, 'certain', 'Address')
            setValue('countryIso2', 'Country Code', c.iso2, 'certain', 'Address')
            continue
          }
        }
        if (def.key === 'state') {
          const r = findRegion(value)
          setValue('state', 'State / Province', r ? r.name : value, 'certain', 'Address')
          continue
        }
        if (def.key === 'city') {
          setValue('city', 'City', titleCase(value.split(/[\s,]+(?:and|or)\s*$/i)[0].replace(/[,\s]+$/, '')), 'certain', 'Address')
          continue
        }
        setValue(def.key, def.label, value, 'certain', def.category)
      }
    }
  }

  // Pass 2: standalone patterns
  // Emails: collect all, first is primary
  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  const emailHits = [...working.matchAll(emailRe)].map((m) => m[0].replace(/[.,;:]+$/, ''))
  if (emailHits.length) {
    const existingPrimary = values.get('primaryEmail')
    if (!existingPrimary) setValue('primaryEmail', 'Primary Email', emailHits[0], 'inferred')
    const existingSecondary = values.get('secondaryEmail')
    if (!existingSecondary && emailHits[1]) setValue('secondaryEmail', 'Secondary Email', emailHits[1], 'inferred')
  }

  // Phones: US and international formats with optional extension
  const phoneRes = [
    /(?:tel|phone|mobile|cell)\s*[:=]?\s*(\+?[\d\s().-]{7,22}\d)/gi,
    /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?:\s*(?:x|ext|extension)\s*\d{1,6})?/g,
    /\b\d{3}[-.]\d{4}\b/g,
  ]
  const phoneHits: string[] = []
  for (const re of phoneRes) {
    for (const m of working.matchAll(re)) {
      const v = (m[1] ?? m[0]).replace(/\s{2,}/g, ' ').trim()
      if (v && !phoneHits.includes(v)) phoneHits.push(v)
    }
  }
  if (phoneHits.length) {
    const existing = values.get('primaryPhone')
    if (!existing) setValue('primaryPhone', 'Primary Phone', phoneHits[0], 'inferred', 'Contact')
    const dial = /^\+(\d{1,3})[\s.-]/.exec(phoneHits[0] + ' ')
    if (dial) setValue('phoneCountryCode', 'Phone Country Code', '+' + dial[1], 'inferred', 'Contact')
  }

  // Age
  const ageMatch = /(?:aged?\s+|he is\s+|she is\s+|is\s+|age\s*[:=]?\s*)?(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|y\/o)\b/i.exec(working) || /\bage\s*[:=]\s*(\d{1,3})\b/i.exec(working)
  if (ageMatch) {
    const age = Number(ageMatch[1])
    if (age >= 0 && age < 130) {
      setValue('age', 'Age', String(age), 'inferred', 'Identity')
      warnings.push(`Birth date not provided; age ${age} captured as an estimate. Verify before relying on it.`)
    }
  }

  // Location phrases
  for (const prep of LOCATION_PREPOSITIONS) {
    const locRe = new RegExp(`${escapeReg(prep)}\\s+([A-Za-z][^.;\\n]{1,80})`, 'i')
    const m = locRe.exec(working)
    if (!m) continue
    const phrase = m[1].trim()
    const parsed = parseLocationPhrase(phrase)
    if (parsed.country) {
      setValue('country', 'Country', parsed.country.name, 'inferred', 'Address')
      setValue('countryIso2', 'Country Code', parsed.country.iso2, 'inferred', 'Address')
    }
    if (parsed.region) setValue('state', 'State / Province', parsed.region, 'inferred', 'Address')
    if (parsed.city) setValue('city', 'City', parsed.city, 'inferred', 'Address')
    else {
      const usCity = CITY_STATE[phrase.toLowerCase().replace(/\s.*$/, '')]
      if (usCity) setValue('state', 'State / Province', usCity, 'inferred', 'Address')
    }
    if (!parsed.country && !parsed.region && !parsed.city) {
      setValue(prep === 'from' ? 'nationality' : 'notes', prep === 'from' ? 'Nationality' : 'Notes', phrase, 'uncertain', prep === 'from' ? 'Identity' : 'Notes')
    }
  }

  // US city inference
  for (const [cityLower, state] of Object.entries(CITY_STATE)) {
    const re = new RegExp(`\\b${escapeReg(cityLower)}\\b`, 'i')
    if (re.test(working)) {
      if (!values.has('city')) setValue('city', 'City', titleCase(cityLower), 'inferred', 'Address')
      if (!values.has('state')) setValue('state', 'State / Province', state, 'inferred', 'Address')
      if (!values.has('country')) setValue('country', 'Country', 'United States', 'inferred', 'Address')
      break
    }
  }

  // Industry phrases: "works in X", "in the X industry", "sector is X", "works at X"
  const industryPhrases = [
    /(?:in the|into the)\s+([A-Za-z][A-Za-z &-]{1,40}?)\s+(industry|sector|space|field|domain)\b/i,
    /(?:works? in|working in|employed in|employed by|industry\s*[:=]|sector\s*[:=]|field of)\s+([A-Za-z][A-Za-z &-]{1,40}?)(?=$|[,;\n]|\.| and | who | with | at | from )/i,
  ]
  for (const re of industryPhrases) {
    const m = re.exec(working)
    if (m) {
      const rawIndustry = (m[1] ?? m[2] ?? '').trim()
      const normalized = normalizeIndustry(rawIndustry)
      if (normalized) {
        setValue('industry', 'Industry', normalized, 'inferred', 'Professional')
        break
      }
    }
  }

  // Company: "works at X", or company following a "works as" role statement
  if (!values.has('company')) {
    const m = /(?:works?|working|employed)\s+(?:at|for|with)\s+([A-Z][\w&.\- ]{1,60})/.exec(working) ||
      /works?\s+as\s+(?:an?\s+)?[A-Za-z][\w\- ]{1,60}?\s+at\s+([A-Z][\w&.\- ]{1,50})/.exec(working)
    if (m) setValue('company', 'Company', m[1].trim(), 'inferred', 'Professional')
  }
  if (!values.has('occupation')) {
    const m = /(?:works?|working|employed)\s+as\s+(?:an?\s+)?([A-Za-z][\w\- ]{1,50})/i.exec(working)
    if (m) setValue('occupation', 'Occupation', m[1].trim(), 'inferred', 'Professional')
  }

  // Explicit dates of birth
  const dobMatch =
    /\b(19\d\d|20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/.exec(working) ||
    new RegExp(`\\b(${MONTH_NAMES})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s*(19\\d\\d|20\\d\\d)\\b`, 'i').exec(working) ||
    /\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*(19\d\d|20\d\d)\b/i.exec(working)
  if (dobMatch && !values.has('dob')) {
    const iso = normalizeDate(dobMatch[0], warnings)
    if (iso) setValue('dob', 'Date of Birth', iso, 'certain', 'Identity')
  }

  // URLs
  const urlMatch = /(?:https?:\/\/|www\.)[^\s,;"']+/.exec(working)
  if (urlMatch) setValue('website', 'Website', urlMatch[0].replace(/[.,;]+$/, ''), 'inferred', 'Contact')

  // Known language
  if (!values.has('preferredLanguage')) {
    const lang = LANGUAGES.find((l) => new RegExp(`\\b${escapeReg(l.name)}\\b`, 'i').test(working))
    if (lang) setValue('preferredLanguage', 'Preferred Language', lang.name, 'inferred', 'Identity')
  }

  // Known timezone
  if (!values.has('timezone')) {
    const tz = TIMEZONES.find((z) => new RegExp(escapeReg(z), 'i').test(working))
    if (tz) setValue('timezone', 'Timezone', tz, 'inferred', 'Identity')
  }

  const fields: ExtractedField[] = [...values.entries()].map(([key, v]) => ({ key, label: v.label, value: v.value, confidence: v.confidence, category: v.category }))
  const plain: Record<string, string> = {}
  for (const f of fields) plain[f.key] = f.value
  return { fields, values: plain, warnings }
}

const MONTH_NAMES = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec'

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function matchCountry(text: string) {
  const lower = text.toLowerCase()
  let best: (typeof COUNTRIES)[number] | null = null
  for (const c of COUNTRIES) {
    const idx = lower.indexOf(c.name.toLowerCase())
    if (idx >= 0 && (!best || c.name.length > best.name.length)) best = c
  }
  if (!best) {
    const code = /\b([A-Za-z]{2})\b/.exec(text)
    if (code) best = COUNTRIES.find((c) => c.iso2 === code[1].toUpperCase()) ?? null
  }
  return best
}

function parseLocationPhrase(phrase: string): { country: { name: string; iso2: string } | null; region: string | null; city: string | null } {
  const parts = phrase.split(',').map((p) => p.trim()).filter(Boolean)
  let country: { name: string; iso2: string } | null = null
  let region: string | null = null
  let city: string | null = null
  for (const part of parts) {
    if (/^(he|she|they|it|his|her|their|who|is|was|works|age|aged|born)\b/i.test(part)) continue
    const cMatch = matchCountry(part)
    if (cMatch && !country) {
      country = { name: cMatch.name, iso2: cMatch.iso2 }
      continue
    }
    const usCityKey = part.toLowerCase().replace(/^the\s+/, '')
    if (CITY_STATE[usCityKey] && !region) {
      region = CITY_STATE[usCityKey]
      if (!city) city = titleCase(usCityKey)
      if (!country) country = { name: 'United States', iso2: 'US' }
      continue
    }
    const rMatch = findRegion(part)
    if (rMatch && !region) {
      region = rMatch.name
      const remainder = (part.slice(0, rMatch.index) + ' ' + part.slice(rMatch.index + rMatch.length)).replace(/[\s,]+/g, ' ').trim()
      if (remainder && !city && /[a-zA-Z]/.test(remainder)) city = titleCase(remainder)
      continue
    }
    if (!city && /[a-zA-Z]/.test(part) && part.length >= 2) city = titleCase(part)
  }
  return { country, region, city }
}

function normalizeDate(value: string, warnings: string[]): string {
  const v = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (iso) return v
  const named = new RegExp(`^(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})$`, 'i').exec(v)
  if (named) {
    const month = monthIndex(named[1])
    return `${named[3]}-${String(month + 1).padStart(2, '0')}-${String(Number(named[2])).padStart(2, '0')}`
  }
  const dmy = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\s*,?\\s*(\\d{4})$`, 'i').exec(v)
  if (dmy) {
    const month = monthIndex(dmy[2])
    return `${dmy[3]}-${String(month + 1).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`
  }
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (slash) {
    warnings.push('Dates with slashes are ambiguous; interpreted as MM/DD/YYYY. Verify.')
    return `${slash[3]}-${String(Number(slash[1])).padStart(2, '0')}-${String(Number(slash[2])).padStart(2, '0')}`
  }
  return v
}

function monthIndex(name: string): number {
  const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'].indexOf(name.toLowerCase())
  if (idx === -1) return 0
  return idx === 8 ? 8 : idx > 8 ? idx - 1 : idx
}

export const INDUSTRY_MAP = INDUSTRY_ALIASES
export const CITY_STATE_MAP = CITY_STATE
