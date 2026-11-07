import fs from 'node:fs'
import path from 'node:path'
import type { Db, Param } from '../db/sqlite'
import type { B2bContact, B2bInput, B2bListQuery, Paginated } from '../../shared/types'
import { AppError, validationError } from '../lib/errors'
import type { AuditService, Actor } from './audit'

function like(term: string): string {
  return `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
}
const SORTS: Record<string, string> = {
  companyName: 'b2b_contacts.company_name COLLATE NOCASE',
  industry: 'b2b_contacts.industry COLLATE NOCASE',
  status: 'b2b_contacts.status',
  createdAt: 'b2b_contacts.created_at',
  updatedAt: 'b2b_contacts.updated_at',
}
const TRACKED: { key: keyof B2bInput; label: string }[] = [
  { key: 'companyName', label: 'Company' },
  { key: 'industry', label: 'Industry' },
  { key: 'website', label: 'Website' },
  { key: 'workType', label: 'Type of Work Needed' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'contactRole', label: 'Contact Role' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
  { key: 'tags', label: 'Tags' },
]

export class B2bService {
  constructor(
    private db: Db,
    private audit: AuditService,
    private exportsDir: string,
  ) {}

  list(query: B2bListQuery, userId: string): Paginated<B2bContact> {
    const where: string[] = ['deleted_at IS NULL']
    const params: Param[] = []
    if (query.status && query.status !== 'all') {
      where.push('status = ?')
      params.push(query.status)
    }
    if (query.industry) {
      where.push('industry = ? COLLATE NOCASE')
      params.push(query.industry)
    }
    if (query.country) {
      where.push('(country_iso2 = ? OR country = ? COLLATE NOCASE)')
      params.push(query.country, query.country)
    }
    if (query.favoritesOnly) where.push('is_favorite = 1')
    const term = (query.search ?? '').trim()
    if (term) {
      where.push(`(
        company_name LIKE ? ESCAPE '\\' OR contact_person LIKE ? ESCAPE '\\' OR contact_role LIKE ? ESCAPE '\\'
        OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR website LIKE ? ESCAPE '\\'
        OR work_type LIKE ? ESCAPE '\\' OR industry LIKE ? ESCAPE '\\' OR tags_text LIKE ? ESCAPE '\\'
        OR b2b_code LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\'
      )`)
      const l = like(term)
      params.push(l, l, l, l, l, l, l, l, l, l, l)
    }
    const clause = where.join(' AND ')
    const total = Number(this.db.value<number>(`SELECT COUNT(*) FROM b2b_contacts WHERE ${clause}`, params) ?? 0)
    const pageSize = Math.min(250, Math.max(1, query.pageSize ?? 50))
    const page = Math.max(1, query.page ?? 1)
    const order = SORTS[query.sort?.key ?? 'updatedAt'] ?? SORTS.updatedAt
    const dir = query.sort?.dir === 'asc' ? 'ASC' : 'DESC'
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT * FROM b2b_contacts WHERE ${clause} ORDER BY ${order} ${dir}, company_name ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    )
    return { rows: rows.map(mapRow), total, page, pageSize }
  }

  get(id: string): B2bContact {
    const row = this.db.get<Record<string, unknown>>('SELECT * FROM b2b_contacts WHERE id = ? AND deleted_at IS NULL', [id])
    if (!row) throw new AppError('NOT_FOUND', 'B2B contact not found.')
    return mapRow(row)
  }

  private validate(input: B2bInput): void {
    const fields: { field: string; message: string }[] = []
    if ((input.companyName ?? '').trim().length < 2) fields.push({ field: 'companyName', message: 'Company name is required (min 2 characters).' })
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) fields.push({ field: 'email', message: 'Enter a valid email address.' })
    if (input.phone && !/^[+\d][+\d\s().-]{4,24}$/.test(input.phone.trim())) fields.push({ field: 'phone', message: 'Enter a valid phone number with country code.' })
    if (input.website && !/^https?:\/\/.+\..+|^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(input.website.trim())) fields.push({ field: 'website', message: 'Enter a valid website, e.g. www.example.com' })
    if (fields.length) validationError(fields)
  }

  private nextCode(): string {
    const year = new Date().getUTCFullYear()
    const n = this.db.transaction(() => {
      const cur = Number(this.db.value<number>(`SELECT value FROM b2b_counters WHERE name = 'b2b_code'`) ?? 0)
      const next = cur + 1
      this.db.run(`UPDATE b2b_counters SET value = ? WHERE name = 'b2b_code'`, [next])
      return next
    })
    return `B2-${year}-${String(n).padStart(6, '0')}`
  }

  private flatten(input: B2bInput): Record<string, string> {
    return {
      companyName: (input.companyName ?? '').trim(),
      industry: (input.industry ?? '').trim(),
      website: (input.website ?? '').trim(),
      workType: (input.workType ?? '').trim(),
      contactPerson: (input.contactPerson ?? '').trim(),
      contactRole: (input.contactRole ?? '').trim(),
      phone: (input.phone ?? '').trim(),
      email: (input.email ?? '').trim(),
      street: (input.street ?? '').trim(),
      city: (input.city ?? '').trim(),
      state: (input.state ?? '').trim(),
      postalCode: (input.postalCode ?? '').trim(),
      country: (input.country ?? '').trim(),
      countryIso2: (input.countryIso2 ?? '').trim().toUpperCase(),
      status: input.status || 'Lead',
      notes: (input.notes ?? '').trim(),
      tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20).join(', '),
    }
  }

  create(input: B2bInput, actor: Actor): B2bContact {
    this.validate(input)
    const f = this.flatten(input)
    const id = crypto.randomUUID()
    const code = this.nextCode()
    const now = new Date().toISOString()
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO b2b_contacts(id, b2b_code, company_name, industry, website, work_type, contact_person, contact_role,
            phone, email, street, city, state, postal_code, country, country_iso2, status, notes, tags_text,
            is_favorite, is_demo, created_by, created_by_username, created_at, updated_by, updated_by_username, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?)`,
        [id, code, f.companyName, f.industry, f.website, f.workType, f.contactPerson, f.contactRole,
         f.phone, f.email, f.street, f.city, f.state, f.postalCode, f.country, f.countryIso2, f.status, f.notes, f.tags,
         actor.id, actor.username, now, actor.username, actor.id, now],
      )
    })
    this.audit.record(actor, { eventType: 'B2B_CONTACT_CREATED', targetType: 'b2b', targetId: id, targetLabel: `${f.companyName} (${code})`, detail: `${f.industry || 'Unspecified industry'} · ${f.status}` })
    return this.get(id)
  }

  update(id: string, input: B2bInput, actor: Actor): B2bContact {
    this.validate(input)
    const existing = this.db.get<Record<string, unknown>>('SELECT * FROM b2b_contacts WHERE id = ? AND deleted_at IS NULL', [id])
    if (!existing) throw new AppError('NOT_FOUND', 'B2B contact not found.')
    const f = this.flatten(input)
    const now = new Date().toISOString()
    const current: Record<string, string> = {
      companyName: String(existing.company_name ?? ''),
      industry: String(existing.industry ?? ''),
      website: String(existing.website ?? ''),
      workType: String(existing.work_type ?? ''),
      contactPerson: String(existing.contact_person ?? ''),
      contactRole: String(existing.contact_role ?? ''),
      phone: String(existing.phone ?? ''),
      email: String(existing.email ?? ''),
      street: String(existing.street ?? ''),
      city: String(existing.city ?? ''),
      state: String(existing.state ?? ''),
      postalCode: String(existing.postal_code ?? ''),
      country: String(existing.country ?? ''),
      countryIso2: String(existing.country_iso2 ?? ''),
      status: String(existing.status ?? ''),
      notes: String(existing.notes ?? ''),
      tags: String(existing.tags_text ?? ''),
    }
    const changes = TRACKED.filter(({ key }) => String(f[key] ?? '') !== current[key])
    this.db.transaction(() => {
      this.db.run(
        `UPDATE b2b_contacts SET company_name=?, industry=?, website=?, work_type=?, contact_person=?, contact_role=?,
            phone=?, email=?, street=?, city=?, state=?, postal_code=?, country=?, country_iso2=?, status=?, notes=?, tags_text=?,
            updated_by=?, updated_by_username=?, updated_at=?
         WHERE id = ?`,
        [f.companyName, f.industry, f.website, f.workType, f.contactPerson, f.contactRole,
         f.phone, f.email, f.street, f.city, f.state, f.postalCode, f.country, f.countryIso2, f.status, f.notes, f.tags,
         actor.username, actor.id, now, id],
      )
    })
    if (changes.length) {
      this.audit.recordMany(actor, changes.map(({ key, label }) => ({
        eventType: 'B2B_FIELD_UPDATED',
        targetType: 'b2b' as const,
        targetId: id,
        targetLabel: f.companyName,
        field: String(key),
        oldValue: current[key] || null,
        newValue: String(f[key] ?? '') || null,
        detail: label,
      })))
      this.audit.record(actor, { eventType: 'B2B_CONTACT_UPDATED', targetType: 'b2b', targetId: id, targetLabel: f.companyName, detail: `${changes.length} field(s) updated` })
    }
    return this.get(id)
  }

  setFavorite(id: string, favorite: boolean, actor: Actor): B2bContact {
    const existing = this.db.get<Record<string, unknown>>('SELECT id, company_name FROM b2b_contacts WHERE id = ? AND deleted_at IS NULL', [id])
    if (!existing) throw new AppError('NOT_FOUND', 'B2B contact not found.')
    this.db.run('UPDATE b2b_contacts SET is_favorite = ?, updated_at = ? WHERE id = ?', [favorite ? 1 : 0, new Date().toISOString(), id])
    this.audit.record(actor, { eventType: 'B2B_CONTACT_UPDATED', targetType: 'b2b', targetId: id, targetLabel: String(existing.company_name), detail: favorite ? 'Marked as favorite' : 'Removed from favorites' })
    return this.get(id)
  }

  remove(id: string, actor: Actor): void {
    const existing = this.db.get<Record<string, unknown>>('SELECT company_name FROM b2b_contacts WHERE id = ? AND deleted_at IS NULL', [id])
    if (!existing) throw new AppError('NOT_FOUND', 'B2B contact not found.')
    const now = new Date().toISOString()
    this.db.run('UPDATE b2b_contacts SET deleted_by = ?, deleted_at = ?, is_favorite = 0 WHERE id = ?', [actor.username, now, id])
    this.audit.record(actor, { eventType: 'B2B_CONTACT_DELETED', targetType: 'b2b', targetId: id, targetLabel: String(existing.company_name), detail: 'Soft-deleted B2B contact' })
  }

  industries(): string[] {
    return this.db.all<{ industry: string }>(
      `SELECT DISTINCT industry FROM b2b_contacts WHERE deleted_at IS NULL AND industry <> '' ORDER BY industry COLLATE NOCASE`,
    ).map((r) => r.industry)
  }

  exportCsv(query: B2bListQuery, actor: Actor, targetPath?: string): { filePath: string; count: number } {
    const result = this.list({ ...query, page: 1, pageSize: 5000 }, actor.id ?? '')
    const columns = ['B2B ID', 'Company', 'Industry', 'Website', 'Type of Work Needed', 'Contact Person', 'Contact Role', 'Phone', 'Email', 'Street', 'City', 'State', 'Postal Code', 'Country', 'Status', 'Tags', 'Notes', 'Created By', 'Created At', 'Updated At']
    const escape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [
      columns.join(','),
      ...result.rows.map((r) => [r.b2bCode, r.companyName, r.industry, r.website, r.workType, r.contactPerson, r.contactRole, r.phone, r.email, r.street, r.city, r.state, r.postalCode, r.country, r.status, r.tags.join('; '), r.notes, r.createdByUsername, r.createdAt, r.updatedAt].map((v) => escape(String(v ?? ''))).join(',')),
    ]
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filePath = targetPath && targetPath.toLowerCase().endsWith('.csv')
      ? targetPath
      : path.join(this.exportsDir, `zeus-vault-b2b-${stamp}.csv`)
    fs.writeFileSync(filePath, lines.join('\r\n'), 'utf8')
    this.audit.record(actor, { eventType: 'B2B_EXPORTED', targetType: 'b2b', detail: `Exported ${result.rows.length} B2B contact(s) to ${path.basename(filePath)}` })
    return { filePath, count: result.rows.length }
  }
}

function mapRow(r: Record<string, unknown>): B2bContact {
  return {
    id: String(r.id),
    b2bCode: String(r.b2b_code),
    companyName: String(r.company_name),
    industry: String(r.industry ?? ''),
    website: String(r.website ?? ''),
    workType: String(r.work_type ?? ''),
    contactPerson: String(r.contact_person ?? ''),
    contactRole: String(r.contact_role ?? ''),
    phone: String(r.phone ?? ''),
    email: String(r.email ?? ''),
    street: String(r.street ?? ''),
    city: String(r.city ?? ''),
    state: String(r.state ?? ''),
    postalCode: String(r.postal_code ?? ''),
    country: String(r.country ?? ''),
    countryIso2: String(r.country_iso2 ?? ''),
    status: (r.status as B2bContact['status']) ?? 'Lead',
    notes: String(r.notes ?? ''),
    tags: String(r.tags_text ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    isFavorite: Number(r.is_favorite) === 1,
    isDemo: Number(r.is_demo) === 1,
    createdByUsername: String(r.created_by_username ?? ''),
    createdAt: String(r.created_at),
    updatedByUsername: (r.updated_by_username as string) ?? null,
    updatedAt: String(r.updated_at),
  }
}