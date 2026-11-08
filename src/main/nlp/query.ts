import { COUNTRIES } from '../../shared/countries'
import { findRegion } from '../../shared/locations'
import { INDUSTRY_MAP, CITY_STATE_MAP, normalizeIndustry } from './engine'
import type { ProfileFilters, SearchClause, SearchInterpretation } from '../../shared/types'

const DAY = 86_400_000
const now = () => new Date()
const iso = (d: Date) => d.toISOString()

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setUTCHours(0, 0, 0, 0)
  return c
}

function stripSearchWords(text: string): string {
  return text
    .replace(/\b(find|show|list|search|get|give|display|bring|pull|fetch|look up|lookup|all|me|everyone|everybody|profiles?|people|persons?|records?|dossiers?|subjects?|candidates?|contacts?|clients?|partners?|stakeholders?|beneficiaries|witnesses|experts|investors|customers?|employees|students?|colleagues?|that|which|who|whose|with|have|has|having|having got|are|is|the|a|an|created|updated|edited|modified|matching|called|named)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface TimeRange {
  from?: string
  to?: string
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

function timeRangeFromPhrase(text: string): { range: TimeRange; label: string } | null {
  const lower = text.toLowerCase()
  const t = now()
  const today = startOfDay(t)
  const dayAfter = new Date(today.getTime() + DAY)
  if (/\btoday\b/.test(lower)) return { range: { from: iso(today), to: iso(dayAfter) }, label: 'today' }
  if (/\byesterday\b/.test(lower)) return { range: { from: iso(new Date(today.getTime() - DAY)), to: iso(today) }, label: 'yesterday' }
  const lastNDays = /\blast\s+(\d{1,3})\s+(?:days?|hours?|weeks?)\b/.exec(lower)
  if (lastNDays) {
    const n = Number(lastNDays[1])
    const unit = /weeks?/.test(lastNDays[0]) ? 7 : /hours?/.test(lastNDays[0]) ? 1 / 24 : 1
    return { range: { from: iso(new Date(t.getTime() - n * unit * DAY)) }, label: `the last ${n} ${unit === 7 ? 'week(s)' : unit === 1 / 24 ? 'hour(s)' : 'day(s)'}` }
  }
  if (/\bthis week\b/.test(lower)) {
    const d = new Date(today)
    const dow = (d.getUTCDay() + 6) % 7
    return { range: { from: iso(new Date(d.getTime() - dow * DAY)) }, label: 'this week' }
  }
  if (/\blast week\b/.test(lower)) {
    const d = new Date(today)
    const dow = (d.getUTCDay() + 6) % 7
    const start = new Date(d.getTime() - (dow + 7) * DAY)
    return { range: { from: iso(start), to: iso(new Date(d.getTime() - dow * DAY)) }, label: 'last week' }
  }
  if (/\bthis month\b/.test(lower)) return { range: { from: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))) }, label: 'this month' }
  if (/\blast month\b/.test(lower)) {
    const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))
    const to = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))
    return { range: { from: iso(from), to: iso(to) }, label: 'last month' }
  }
  if (/\bthis year\b/.test(lower)) return { range: { from: iso(new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) }, label: 'this year' }
  if (/\blast year\b/.test(lower)) {
    return { range: { from: iso(new Date(Date.UTC(t.getUTCFullYear() - 1, 0, 1))), to: iso(new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) }, label: 'last year' }
  }
  if (/\brecently\b/.test(lower)) return { range: { from: iso(new Date(t.getTime() - 30 * DAY)) }, label: 'the last 30 days' }
  const yearMatch = /\b(?:created|added|made|registered|in)\s+(?:in\s+)?(\d{4})\b/.exec(lower)
  if (yearMatch) {
    const y = Number(yearMatch[1])
    return { range: { from: `${y}-01-01`, to: `${y}-12-31` }, label: String(y) }
  }
  const monthYear = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*(?:of\s+)?(\d{4})\b/.exec(lower)
  if (monthYear) {
    const mIdx = MONTHS[monthYear[1]]
    const y = Number(monthYear[2])
    const pad = (n: number) => String(n).padStart(2, '0')
    const lastDay = new Date(Date.UTC(y, mIdx + 1, 0)).getUTCDate()
    return { range: { from: `${y}-${pad(mIdx + 1)}-01`, to: `${y}-${pad(mIdx + 1)}-${pad(lastDay)}` }, label: `${monthYear[1]} ${y}` }
  }
  const isoDateMatch = /\b(after|since|from)\s+(\d{4}-\d{2}-\d{2})\b/.exec(lower)
  if (isoDateMatch) return { range: { from: isoDateMatch[2] }, label: `after ${isoDateMatch[2]}` }
  const beforeMatch = /\bbefore\s+(\d{4}-\d{2}-\d{2})\b/.exec(lower)
  if (beforeMatch) return { range: { to: beforeMatch[1] }, label: `before ${beforeMatch[1]}` }
  return null
}

const PROVIDERS: Record<string, string> = {
  gmail: 'gmail.com',
  googlemail: 'gmail.com',
  outlook: 'outlook.com',
  hotmail: 'hotmail.com',
  live: 'live.com',
  yahoo: 'yahoo.com',
  protonmail: 'protonmail.com',
  proton: 'proton.me',
  icloud: 'icloud.com',
  aol: 'aol.com',
  gmx: 'gmx.com',
  zoho: 'zoho.com',
  fastmail: 'fastmail.com',
}

export function interpretQuery(rawText: string, opts: { currentUsername?: string } = {}): SearchInterpretation {
  const text = rawText.trim()
  const lower = text.toLowerCase()
  const clauses: SearchClause[] = []
  const filters: ProfileFilters = {}
  let residual = ` ${lower} `

  // View modifiers
  if (/\barchived\b/.test(lower)) {
    filters.view = 'archived'
    clauses.push({ field: 'view', label: 'View', value: 'Archived', confidence: 'certain' })
    residual = residual.replace(/archived/g, ' ')
  }
  if (/\b(favorite|favourite|starred|pinned)s?\b/.test(lower)) {
    filters.view = 'favorites'
    clauses.push({ field: 'view', label: 'View', value: 'Favorites', confidence: 'certain' })
    residual = residual.replace(/(favorite|favourite|starred|pinned)s?/g, ' ')
  }

  // Limits and ordering: "top 10", "first 5", "latest 20", "newest first", "sort by name"
  const limitMatch = /\b(?:top|first|latest|last)\s+(\d{1,3})\b/.exec(residual)
  if (limitMatch) {
    filters.limit = Math.min(250, Math.max(1, Number(limitMatch[1])))
    clauses.push({ field: 'limit', label: 'Limit', value: String(filters.limit), confidence: 'certain' })
    residual = residual.replace(limitMatch[0], ' ')
  }
  if (/\b(newest|latest|most recent)\b/.test(residual) || /\bsort by (created|updated)\b/.test(residual)) {
    filters.sort = /\bupdated\b/.test(residual) ? { key: 'updatedAt', dir: 'desc' } : { key: 'createdAt', dir: 'desc' }
    residual = residual.replace(/\b(newest|latest|most recent)\b/g, ' ').replace(/\bsort by (created|updated)( at)?\b/g, ' ')
  } else if (/\boldest\b/.test(residual)) {
    filters.sort = { key: 'createdAt', dir: 'asc' }
    residual = residual.replace(/\boldest( first)?\b/g, ' ')
  } else if (/\b(alphabetical|sort by name|name order)\b/.test(residual)) {
    filters.sort = { key: 'fullName', dir: 'asc' }
    residual = residual.replace(/\b(alphabetical(ly)?|sort by name|name order)\b/g, ' ')
  }

  // Creator: explicit username, or "me"
  const meMatch = /\b(?:created|added|made|registered|entered)\s+by\s+(?:me|myself|me\b)\b/.exec(residual)
  if (meMatch && opts.currentUsername) {
    filters.createdBy = opts.currentUsername
    clauses.push({ field: 'createdBy', label: 'Created by', value: 'me', confidence: 'certain' })
    residual = residual.replace(meMatch[0], ' ')
  } else if (/\bmy\s+(profiles?|dossiers?|contacts?|records?)\b/.test(residual) && opts.currentUsername) {
    filters.createdBy = opts.currentUsername
    clauses.push({ field: 'createdBy', label: 'Created by', value: 'me', confidence: 'certain' })
    residual = residual.replace(/\bmy\s+(profiles?|dossiers?|contacts?|records?)\b/g, ' ')
  } else {
    const createdBy = /\b(?:created|added|made|registered|entered)\s+by\s+([a-z0-9._-]{2,40})/.exec(residual) || /\bauthor(?:ed)?\s+by\s+([a-z0-9._-]{2,40})/.exec(residual)
    if (createdBy) {
      filters.createdBy = createdBy[1]
      clauses.push({ field: 'createdBy', label: 'Created by', value: createdBy[1], confidence: 'certain' })
      residual = residual.replace(createdBy[0], ' ')
    }
  }

  // Time ranges
  const mentionsUpdated = /\b(updated|edited|modified|changed|touched)\b/.test(lower)
  const time = timeRangeFromPhrase(lower)
  if (time) {
    if (mentionsUpdated) {
      filters.updatedFrom = time.range.from
      filters.updatedTo = time.range.to?.slice(0, 10)
      clauses.push({ field: 'updatedFrom', label: 'Updated', value: `within ${time.label}`, confidence: 'inferred' })
    } else {
      filters.createdFrom = time.range.from
      filters.createdTo = time.range.to?.slice(0, 10)
      clauses.push({ field: 'createdFrom', label: 'Created', value: `within ${time.label}`, confidence: 'inferred' })
    }
  }
  if (/\brecently\s+(edited|updated|modified)\b/.test(lower) || /\b(last|latest)\s+(edited|updated|modified)\b/.test(lower)) {
    filters.sort = { key: 'updatedAt', dir: 'desc' }
    if (!filters.updatedFrom) {
      filters.updatedFrom = iso(new Date(Date.now() - 30 * DAY))
      clauses.push({ field: 'updatedFrom', label: 'Updated', value: 'recently (30d)', confidence: 'inferred' })
    }
  }

  // Tags: "tag:x", "tagged with x", "with tag x", "tags x"
  const tagMatch = /\b(?:tagged?|tag)\s*[:=]?\s*(?:with\s+|as\s+)?([a-z0-9_-]{1,40})\b/.exec(residual)
  if (tagMatch) {
    filters.tags = [...(filters.tags ?? []), tagMatch[1]]
    clauses.push({ field: 'tags', label: 'Tag', value: tagMatch[1], confidence: 'certain' })
    residual = residual.replace(tagMatch[0], ' ')
  }

  // Email provider
  for (const [word, domain] of Object.entries(PROVIDERS)) {
    if (new RegExp(`\\b${word}(?:\\s*(?:addresses?|mail|emails?|accounts?|users?))?\\b`).test(lower)) {
      filters.emailDomain = domain
      clauses.push({ field: 'emailDomain', label: 'Email provider', value: domain, confidence: 'certain' })
      residual = residual.replace(new RegExp(word, 'g'), ' ')
      break
    }
  }
  const domainMatch = /@\s*([a-z0-9.-]+\.[a-z]{2,})/.exec(lower) || /\bdomain\s+([a-z0-9.-]+\.[a-z]{2,})\b/.exec(lower)
  if (domainMatch && !filters.emailDomain) {
    filters.emailDomain = domainMatch[1]
    clauses.push({ field: 'emailDomain', label: 'Email domain', value: domainMatch[1], confidence: 'certain' })
    residual = residual.replace(domainMatch[0], ' ')
  }

  // Missing fields
  const missingMatch = /\b(?:missing|without|no|lacking|lacks|absent|empty)\s+(?:a\s+|an\s+)?(phone numbers?|phones?|mobiles?|emails?|e-?mails?|dob|birth ?dates?|dates? of birth|websites?|sites?|urls?|company|employer|country|city|state|zip ?codes?|postal ?codes?|notes?|images?|photos?|avatars?)\b/.exec(lower)
  if (missingMatch) {
    const raw = missingMatch[1].toLowerCase()
    const map: Record<string, string> = {
      phone: 'phone', 'phone number': 'phone', 'phone numbers': 'phone', phones: 'phone', mobile: 'phone', mobiles: 'phone',
      email: 'email', emails: 'email', 'e-mail': 'email', 'e-mails': 'email',
      dob: 'dob', 'birth date': 'dob', 'birth dates': 'dob', 'date of birth': 'dob', 'dates of birth': 'dob', birthdate: 'dob',
      website: 'website', websites: 'website', site: 'website', sites: 'website', url: 'website', urls: 'website',
      country: 'country', city: 'city', state: 'state',
      'zip code': 'postalCode', 'zip codes': 'postalCode', 'postal code': 'postalCode', 'postal codes': 'postalCode', postcode: 'postalCode',
      notes: 'notes', note: 'notes',
      company: 'company', employer: 'company',
    }
    const key = map[raw] ?? map[raw.replace(/s$/, '')]
    const missing = filters.missing ?? []
    if (key && !missing.includes(key)) missing.push(key)
    filters.missing = missing
    clauses.push({ field: 'missing', label: 'Missing', value: key ?? raw, confidence: 'certain' })
    residual = residual.replace(missingMatch[0], ' ')
  }

  // Gender
  const genderMatch = /\b(male|female|non-?binary|other)\s*(?:profiles?|people|persons?|members?)?/.exec(lower)
  if (genderMatch) {
    const g = genderMatch[1].replace(/non-?binary/i, 'Non-binary')
    filters.gender = g.charAt(0).toUpperCase() + g.slice(1)
    clauses.push({ field: 'gender', label: 'Gender', value: filters.gender, confidence: 'inferred' })
    residual = residual.replace(genderMatch[0], ' ')
  }

  // Industry: explicit phrases or a bare "in <known industry>"
  const industryPhrase = /\b(?:work(?:s|ing|ed)?\s+in|employed\s+in|industry\s*[:=]?|sector\s*[:=]?)\s+([a-z][a-z -]{1,40})/.exec(lower)
  if (industryPhrase) {
    const val = normalizeIndustry(industryPhrase[1].trim().replace(/\s+(?:and|with|who|that|from).*$/, ''))
    if (val) {
      filters.industry = val
      clauses.push({ field: 'industry', label: 'Industry', value: val, confidence: 'inferred' })
      residual = residual.replace(industryPhrase[0], ' ')
    }
  } else {
    const inIndustry = new RegExp(`\\bin\\s+(${Object.keys(INDUSTRY_MAP).join('|')})(?:\\s+industry|\\s+sector)?\\b`).exec(residual)
    if (inIndustry) {
      const val = INDUSTRY_MAP[inIndustry[1]]
      if (val) {
        filters.industry = val
        clauses.push({ field: 'industry', label: 'Industry', value: val, confidence: 'inferred' })
        residual = residual.replace(inIndustry[0], ' ')
      }
    }
  }

  // Company: "works at X", "company: X"
  const companyMatch = /\b(?:works? at|works? for|company\s*[:=]?)\s+([a-z][\w&.\- ]{1,50})/.exec(residual)
  if (companyMatch) {
    filters.company = companyMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase())
    clauses.push({ field: 'company', label: 'Company', value: filters.company, confidence: 'inferred' })
    residual = residual.replace(companyMatch[0], ' ')
  }

  // Country / known city / region
  let bestCountry: (typeof COUNTRIES)[number] | null = null
  for (const c of COUNTRIES) {
    const idx = lower.indexOf(c.name.toLowerCase())
    if (idx >= 0 && (!bestCountry || c.name.length > bestCountry.name.length)) bestCountry = c
  }
  if (bestCountry) {
    filters.country = bestCountry.iso2
    clauses.push({ field: 'country', label: 'Country', value: bestCountry.name, confidence: 'certain' })
    residual = residual.replace(new RegExp(bestCountry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
  } else {
    const rMatch = findRegion(lower)
    if (rMatch) {
      filters.location = rMatch.name
      clauses.push({ field: 'location', label: 'Region', value: rMatch.name, confidence: 'certain' })
      residual = residual.slice(0, Math.max(0, rMatch.index)) + ' ' + residual.slice(rMatch.index + rMatch.length)
    } else {
      for (const [cityLower] of Object.entries(CITY_STATE_MAP)) {
        if (new RegExp(`\\b${cityLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
          filters.location = cityLower.replace(/\b\w/g, (c) => c.toUpperCase())
          clauses.push({ field: 'location', label: 'City', value: filters.location, confidence: 'certain' })
          residual = residual.replace(new RegExp(cityLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
          break
        }
      }
    }
  }

  // Category
  const catMatch = /\b(?:categor(?:y|ies)|classified\s+as|type)\s*[:=]?\s*([a-z][a-z '&-]{1,40})/.exec(lower)
  if (catMatch) {
    const val = catMatch[1].trim().replace(/\s+(?:and|with|who|that|from|in).*$/, '').trim()
    if (val) {
      filters.categoryName = val
      clauses.push({ field: 'categoryName', label: 'Category', value: val, confidence: 'inferred' })
      residual = residual.replace(catMatch[0], ' ')
    }
  }

  // Profile status
  const statusMatch = /\b(active|inactive|pending|restricted)\s+(?:status\s+)?profiles?\b/.exec(lower)
  if (statusMatch) {
    const s = statusMatch[1]
    filters.statusList = s.charAt(0).toUpperCase() + s.slice(1)
    clauses.push({ field: 'statusList', label: 'Profile status', value: filters.statusList, confidence: 'certain' })
    residual = residual.replace(statusMatch[0], ' ')
  }

  // Remaining free text
  const freeText = stripSearchWords(residual).replace(/\s+/g, ' ').trim()
  return { freeText, clauses, filters, nlp: clauses.length > 0 || freeText.length > 0 }
}

export function isNaturalLanguage(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  return /\b(find|show|list|search|get|give|who|everyone|everybody|created by|updated by|with|without|missing|last|this|recently|from|in|located|based|work|tagged|categor|top|latest)\b/.test(t) && /\s/.test(t)
}
