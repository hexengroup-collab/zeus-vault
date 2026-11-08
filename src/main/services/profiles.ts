import type { Db, Param } from '../db/sqlite'
import type {
  CustomField,
  FieldHistoryEntry,
  Paginated,
  ProfileDetail,
  ProfileInput,
  ProfileListItem,
  ProfileQuery,
  SocialLink,
  TagRecord,
  UpdateProfileResult,
} from '../../shared/types'
import { AppError, validationError } from '../lib/errors'
import { decryptField, encryptField } from '../lib/crypto'
import type { AuditService, Actor } from './audit'
import type { SettingsService } from './settings'

interface ListRow {
  id: string
  profile_code: string
  full_name: string
  username: string
  country: string
  country_iso2: string
  city: string
  state: string
  gender: string
  dob: string
  avatar_blob: string | null
  status: 'active' | 'archived'
  is_demo: number
  view_count: number
  created_by: string | null
  created_by_username: string | null
  created_at: string
  updated_by: string | null
  updated_by_username: string | null
  updated_at: string
  category_id: string | null
  category_name: string | null
  category_color: string | null
  primary_phone: string | null
  primary_email: string | null
  is_favorite: number
  last_viewed_at: string | null
}

const SORT_COLUMNS: Record<string, string> = {
  fullName: 'p.full_name COLLATE NOCASE',
  profileCode: 'p.profile_code',
  username: 'p.username COLLATE NOCASE',
  country: 'p.country COLLATE NOCASE',
  city: 'p.city COLLATE NOCASE',
  phone: 'pc.primary_phone',
  email: 'pc.primary_email COLLATE NOCASE',
  category: 'cat.name COLLATE NOCASE',
  createdAt: 'p.created_at',
  updatedAt: 'p.updated_at',
  viewCount: 'p.view_count',
  status: 'p.status',
}

const MISSING_COLUMNS: Record<string, string> = {
  phone: `(COALESCE(pc.primary_phone,'') = '')`,
  email: `(COALESCE(pc.primary_email,'') = '')`,
  dob: `p.dob = ''`,
  country: `p.country_iso2 = ''`,
  website: `COALESCE(pc.website,'') = ''`,
  password: `COALESCE(pa.password_enc,'') = ''`,
  city: `p.city = ''`,
  notes: `p.notes = ''`,
  company: `COALESCE(pf.company,'') = ''`,
}

function sanitizeSort(sort?: { key: string; dir: 'asc' | 'desc' }): string {
  const col = sort?.key && SORT_COLUMNS[sort.key] ? SORT_COLUMNS[sort.key] : 'p.updated_at'
  const dir = sort?.dir === 'asc' ? 'ASC' : 'DESC'
  return `${col} ${dir}`
}

function like(term: string): string {
  return `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
}

export interface ProfileActor extends Actor {
  userId: string | null
  username: string
}

export class ProfilesService {
  photoHook?: (profileId: string, imageId: string | null, kind: 'avatar' | 'gallery' | 'attachment') => void
  photoRemovedHook?: (profileId: string, imageId: string | null, kind: 'avatar' | 'gallery' | 'attachment') => void
  ocrHook?: (attachmentId: string, profileId: string) => void
  constructor(
    private db: Db,
    private audit: AuditService,
    private settings: SettingsService,
    private fieldKey: Buffer,
  ) {}

  // ---------- helpers ----------

  private touchView(profileId: string, actor: Actor): void {
    this.db.run('UPDATE profiles SET view_count = view_count + 1 WHERE id = ?', [profileId])
    this.db.run('INSERT INTO profile_views(id, profile_id, user_id, viewed_at) VALUES (?,?,?,?)', [
      crypto.randomUUID(),
      profileId,
      actor.id,
      new Date().toISOString(),
    ])
  }

  syncFts(profileId: string): void {
    try {
      this.db.run('DELETE FROM profiles_fts WHERE profile_id = ?', [profileId])
    } catch {
      return
    }
    const row = this.db.get<Record<string, unknown>>(
      `SELECT p.full_name, p.username, p.city, p.state, p.country, p.tags_text, p.notes,
              COALESCE(cat.name,'') AS category,
              COALESCE(pc.primary_email,'') || ' ' || COALESCE(pc.secondary_email,'') || ' ' || COALESCE(pc.alt_email,'') || ' ' || COALESCE(pf.work_email,'') || ' ' || COALESCE(pa.login_email,'') AS emails,
              COALESCE(pc.primary_phone,'') || ' ' || COALESCE(pc.secondary_phone,'') AS phones
         FROM profiles p
         LEFT JOIN profile_categories cat ON cat.id = p.category_id
         LEFT JOIN profile_contacts pc ON pc.profile_id = p.id
         LEFT JOIN profile_professional pf ON pf.profile_id = p.id
         LEFT JOIN profile_accounts pa ON pa.profile_id = p.id
        WHERE p.id = ?`,
      [profileId],
    )
    if (!row) return
    const str = (v: unknown) => String(v ?? '')
    const params: Param[] = [
      profileId,
      str(row.full_name),
      str(row.username),
      str(row.emails),
      str(row.phones),
      str(row.city),
      str(row.state),
      str(row.country),
      str(row.category),
      str(row.tags_text),
      str(row.notes),
    ]
    this.db.run(
      `INSERT INTO profiles_fts(profile_id, full_name, username, emails, phones, city, state, country, category, tags, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      params,
    )
  }

  private nextProfileCode(): string {
    const year = new Date().getUTCFullYear()
    const n = this.db.transaction(() => {
      const cur = Number(this.db.value<number>(`SELECT value FROM counters WHERE name = 'profile_code'`) ?? 0)
      const next = cur + 1
      this.db.run(`UPDATE counters SET value = ? WHERE name = 'profile_code'`, [next])
      return next
    })
    return `ZV-${year}-${String(n).padStart(6, '0')}`
  }

  private findOrCreateTag(name: string): string | null {
    const clean = name.trim()
    if (!clean) return null
    const existing = this.db.get<{ id: string }>('SELECT id FROM profile_tags WHERE name = ? COLLATE NOCASE', [clean])
    if (existing) return existing.id
    const id = crypto.randomUUID()
    this.db.run('INSERT INTO profile_tags(id, name, color, created_at) VALUES (?,?,?,?)', [
      id,
      clean.slice(0, 80),
      '#D69B45',
      new Date().toISOString(),
    ])
    return id
  }

  private syncTags(profileId: string, tags: string[], actorUsername: string): void {
    const wanted = [...new Set(tags.map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 80)))].slice(0, 30)
    this.db.run('DELETE FROM profile_tag_assignments WHERE profile_id = ?', [profileId])
    const now = new Date().toISOString()
    for (const t of wanted) {
      const tagId = this.findOrCreateTag(t)
      if (tagId) {
        this.db.run(
          'INSERT OR IGNORE INTO profile_tag_assignments(profile_id, tag_id, assigned_at, assigned_by) VALUES (?,?,?,?)',
          [profileId, tagId, now, actorUsername],
        )
      }
    }
    this.db.run('UPDATE profiles SET tags_text = ? WHERE id = ?', [wanted.join(', '), profileId])
  }

  private fieldMetaUpsert(profileId: string, section: string, fields: { field: string; label: string }[], actor: Actor, when: string): void {
    for (const f of fields) {
      this.db.run(
        `INSERT INTO profile_fields(profile_id, section, field, updated_by, updated_by_user_id, updated_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(profile_id, section, field) DO UPDATE SET updated_by = excluded.updated_by, updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`,
        [profileId, section, f.field, actor.username, actor.id, when],
      )
    }
  }

  private recordHistory(events: {
    profileId: string
    section: string
    field: string
    label: string
    oldValue: string | null
    newValue: string | null
    action: string
    actor: Actor
    at: string
  }[]): void {
    for (const e of events) {
      const sensitive = /password|recovery|secret|token/i.test(e.field)
      const oldV = sensitive && e.oldValue ? '[redacted]' : e.oldValue
      const newV = sensitive && e.newValue ? '[redacted]' : e.newValue
      this.db.run(
        `INSERT INTO profile_field_history(id, profile_id, section, field, field_label, old_value, new_value, action, actor_id, actor_username, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          e.profileId,
          e.section,
          e.field,
          e.label,
          oldV,
          newV,
          e.action,
          e.actor.id,
          e.actor.username,
          e.at,
        ],
      )
    }
  }

  // ---------- listing ----------

  private buildWhere(q: ProfileQuery, userId: string): { clause: string; params: (string | number)[] } {
    const where: string[] = ['p.deleted_at IS NULL']
    const params: (string | number)[] = []

    if (q.view === 'archived') where.push(`p.status = 'archived'`)
    else if (q.view === 'all-status') { /* both */ }
    else where.push(`p.status = 'active'`)

    if (q.view === 'favorites') {
      where.push('EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = p.id AND f.user_id = ?)')
      params.push(userId)
    }

    if (q.country) {
      where.push('(p.country_iso2 = ? OR p.country = ? COLLATE NOCASE)')
      params.push(q.country, q.country)
    }
    if (q.categoryId) {
      where.push('p.category_id = ?')
      params.push(q.categoryId)
    }
    if (q.categoryName) {
      where.push('cat.name = ? COLLATE NOCASE')
      params.push(q.categoryName)
    }
    if (q.location) {
      const l = like(q.location)
      where.push(`(p.city LIKE ? ESCAPE '\\' OR p.state LIKE ? ESCAPE '\\' OR p.country LIKE ? ESCAPE '\\')`)
      params.push(l, l, l)
    }
    if (q.industry) {
      where.push(`pf.industry LIKE ? ESCAPE '\\'`)
      params.push(like(q.industry))
    }
    if (q.company) {
      where.push(`pf.company LIKE ? ESCAPE '\\'`)
      params.push(like(q.company))
    }
    if (q.emailDomain) {
      where.push(`(COALESCE(pc.primary_email,'') LIKE ? ESCAPE '\\' OR COALESCE(pc.secondary_email,'') LIKE ? ESCAPE '\\' OR COALESCE(pc.alt_email,'') LIKE ? ESCAPE '\\')`)
      const l = like(`@${q.emailDomain.replace(/^@/, '')}`)
      params.push(l, l, l)
    }
    if (q.createdBy) {
      where.push('(p.created_by_user_id = ? OR cu.username = ? COLLATE NOCASE)')
      params.push(q.createdBy, q.createdBy)
    }
    if (q.gender) {
      where.push('p.gender = ?')
      params.push(q.gender)
    }
    if (q.statusList && q.statusList !== 'all') {
      where.push('p.profile_status = ?')
      params.push(q.statusList)
    }
    if (q.createdFrom) {
      where.push('p.created_at >= ?')
      params.push(q.createdFrom)
    }
    if (q.createdTo) {
      where.push('p.created_at <= ?')
      params.push(`${q.createdTo}T23:59:59.999Z`)
    }
    if (q.updatedFrom) {
      where.push('p.updated_at >= ?')
      params.push(q.updatedFrom)
    }
    if (q.updatedTo) {
      where.push('p.updated_at <= ?')
      params.push(`${q.updatedTo}T23:59:59.999Z`)
    }
    if (q.tags?.length) {
      for (const t of q.tags) {
        where.push(
          `EXISTS(SELECT 1 FROM profile_tag_assignments pta JOIN profile_tags pt ON pt.id = pta.tag_id WHERE pta.profile_id = p.id AND pt.name = ? COLLATE NOCASE)`,
        )
        params.push(t)
      }
    }
    if (q.missing?.length) {
      for (const m of q.missing) {
        const col = MISSING_COLUMNS[m]
        if (col) where.push(col)
      }
    }

    const term = (q.search ?? '').trim()
    if (term) {
      const tokens = term
        .split(/\s+/)
        .map((t) => t.replace(/"/g, '').replace(/[^\w@.-]/g, ''))
        .filter(Boolean)
      const ftsTerm = tokens.map((t) => `"${t}"*`).join(' AND ')
      let ftsIds: string[] | null = null
      if (ftsTerm) {
        try {
          ftsIds = this.db
            .all<{ profile_id: string }>('SELECT profile_id FROM profiles_fts WHERE profiles_fts MATCH ?', [ftsTerm])
            .map((r) => r.profile_id)
        } catch {
          ftsIds = null
        }
      }
      // Strict AND matches nothing: fall back to any-token recall so a
      // single unrecognized word never zeroes the results.
      if (ftsIds?.length === 0 && tokens.length > 1) {
        const orTerm = tokens.map((t) => `"${t}"*`).join(' OR ')
        try {
          ftsIds = this.db
            .all<{ profile_id: string }>('SELECT profile_id FROM profiles_fts WHERE profiles_fts MATCH ?', [orTerm])
            .map((r) => r.profile_id)
        } catch {
          ftsIds = null
        }
      }
      if (ftsIds) {
        where.push(
          ftsIds.length
            ? `p.id IN (${ftsIds.map(() => '?').join(',')})`
            : '0',
        )
        params.push(...ftsIds)
      } else {
        const l = like(term)
        where.push(
          `(p.full_name LIKE ? ESCAPE '\\' OR p.username LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\' OR p.state LIKE ? ESCAPE '\\' OR p.country LIKE ? ESCAPE '\\' OR p.profile_code LIKE ? ESCAPE '\\' OR pc.primary_email LIKE ? ESCAPE '\\' OR pc.primary_phone LIKE ? ESCAPE '\\')`,
        )
        params.push(l, l, l, l, l, l, l, l)
      }
    }

    return { clause: where.join(' AND '), params }
  }

  list(q: ProfileQuery, userId: string): Paginated<ProfileListItem> {
    const { clause, params } = this.buildWhere(q, userId)
    const base = `
      FROM profiles p
      LEFT JOIN profile_categories cat ON cat.id = p.category_id
      LEFT JOIN profile_contacts pc ON pc.profile_id = p.id
      LEFT JOIN profile_accounts pa ON pa.profile_id = p.id
      LEFT JOIN profile_professional pf ON pf.profile_id = p.id
      LEFT JOIN users cu ON cu.id = p.created_by_user_id
      LEFT JOIN users uu ON uu.id = p.updated_by_user_id
      WHERE ${clause}`
    const total = Number(this.db.value<number>(`SELECT COUNT(*) ${base}`, params) ?? 0)
    const limit = q.limit && q.limit > 0 ? Math.min(250, Math.floor(q.limit)) : undefined
    const pageSize = Math.min(250, Math.max(1, limit ?? q.pageSize ?? 50))
    const page = limit ? 1 : Math.max(1, q.page ?? 1)
    const order = sanitizeSort(q.sort)
    const rows = this.db.all<ListRow>(
      `SELECT p.id, p.profile_code, p.full_name, p.username, p.country, p.country_iso2, p.city, p.state,
              p.gender, p.dob, p.avatar_blob, p.status, p.is_demo, p.view_count,
              p.created_by, p.created_at, p.updated_at, p.category_id,
              cu.username AS created_by_username, uu.username AS updated_by_username,
              cat.name AS category_name, cat.color AS category_color,
              pc.primary_phone, pc.primary_email,
              EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = p.id AND f.user_id = ?) AS is_favorite,
              (SELECT viewed_at FROM profile_views pv WHERE pv.profile_id = p.id ORDER BY viewed_at DESC LIMIT 1) AS last_viewed_at
       ${base}
       ORDER BY ${order} NULLS LAST, p.full_name ASC
       LIMIT ? OFFSET ?`,
      [userId, ...params, pageSize, (page - 1) * pageSize],
    )
    return {
      rows: rows.map(mapListRow),
      total,
      page,
      pageSize,
    }
  }

  listAllForExport(q: ProfileQuery, userId: string): ProfileListItem[] {
    const pageSize = 250
    const first = this.list({ ...q, page: 1, pageSize }, userId)
    const all = [...first.rows]
    for (let p = 2; p <= Math.ceil(first.total / pageSize); p++) {
      all.push(...this.list({ ...q, page: p, pageSize }, userId).rows)
    }
    return all
  }

  private decryptRecovery(id: string): string {
    const v = this.db.value<string>('SELECT recovery_enc FROM profile_accounts WHERE profile_id = ?', [id])
    if (!v) return ''
    try {
      return decryptField(v, this.fieldKey)
    } catch {
      return ''
    }
  }

  // ---------- detail ----------

  get(id: string, actor: Actor, opts: { trackView?: boolean } = {}): ProfileDetail {
    const p = this.db.get<Record<string, unknown>>(
      `SELECT p.*, cat.name AS category_name FROM profiles p LEFT JOIN profile_categories cat ON cat.id = p.category_id WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id],
    )
    if (!p) throw new AppError('NOT_FOUND', 'Profile not found.')
    const trackViews = opts.trackView ?? this.settings.get().trackViews
    if (trackViews) this.touchView(id, actor)

    const contact = this.db.get<Record<string, unknown>>('SELECT * FROM profile_contacts WHERE profile_id = ?', [id]) ?? {}
    const address = this.db.get<Record<string, unknown>>('SELECT * FROM profile_addresses WHERE profile_id = ?', [id]) ?? {}
    const accountRow = this.db.get<Record<string, unknown>>('SELECT * FROM profile_accounts WHERE profile_id = ?', [id]) ?? {}
    const professional = this.db.get<Record<string, unknown>>('SELECT * FROM profile_professional WHERE profile_id = ?', [id]) ?? {}
    const notes = this.db.get<Record<string, unknown>>('SELECT * FROM profile_notes WHERE profile_id = ?', [id]) ?? {}
    const customFields = this.db.all<Record<string, unknown>>('SELECT * FROM profile_custom_fields WHERE profile_id = ? ORDER BY updated_at ASC', [id])
    const attachments = this.db.all<Record<string, unknown>>('SELECT * FROM attachments WHERE profile_id = ? ORDER BY created_at DESC', [id])
    const images = this.db.all<Record<string, unknown>>("SELECT * FROM profile_images WHERE profile_id = ? AND kind = 'gallery' ORDER BY created_at DESC", [id])
    const tags = this.db.all<TagRecord>(
      `SELECT t.id, t.name, t.color, (SELECT COUNT(*) FROM profile_tag_assignments a WHERE a.tag_id = t.id) AS profileCount
       FROM profile_tags t JOIN profile_tag_assignments a ON a.tag_id = t.id WHERE a.profile_id = ? ORDER BY t.name`,
      [id],
    )
    const fieldMetaRows = this.db.all<Record<string, unknown>>(
      `SELECT field, updated_at, updated_by FROM profile_fields WHERE profile_id = ? ORDER BY updated_at DESC`,
      [id],
    )

    const decrypt = (v: unknown): string => {
      const s = typeof v === 'string' ? v : ''
      if (!s) return ''
      try {
        return decryptField(s, this.fieldKey)
      } catch {
        return ''
      }
    }

    let parsedLinks: SocialLink[] = []
    try {
      parsedLinks = JSON.parse(String(contact.social_links ?? '[]')) as SocialLink[]
    } catch {
      parsedLinks = []
    }
    let personalTags: string[] = []
    try {
      personalTags = JSON.parse(String(notes.personal_tags ?? '[]')) as string[]
    } catch {
      personalTags = []
    }

    const lastView = this.db.get<{ viewed_at: string }>('SELECT viewed_at FROM profile_views WHERE profile_id = ? ORDER BY viewed_at DESC LIMIT 1', [id])
    const isFavorite = !!this.db.value<number>('SELECT 1 FROM favorites WHERE user_id = ? AND profile_id = ?', [actor.id, id])

    const mapAttachment = (a: Record<string, unknown>) => ({
      id: String(a.id),
      profileId: id,
      kind: 'attachment' as const,
      category: String(a.category ?? 'documents'),
      name: String(a.name),
      mime: String(a.mime),
      size: Number(a.size),
      dataUrl: String(a.blob),
      createdAt: String(a.created_at),
      uploadedBy: String(a.uploaded_by ?? ''),
    })

    return {
      id: String(p.id),
      profileCode: String(p.profile_code),
      status: p.status as ProfileDetail['status'],
      isDemo: Number(p.is_demo) === 1,
      isFavorite,
      avatar: (p.avatar_blob as string) || null,
      images: images.map((img) => ({
        id: String(img.id),
        kind: String(img.kind),
        name: String(img.name),
        mime: String(img.mime),
        size: Number(img.size),
        dataUrl: String(img.blob),
        createdAt: String(img.created_at),
      })),
      tags,
      basic: {
        fullName: String(p.full_name ?? ''),
        username: String(p.username ?? ''),
        dob: String(p.dob ?? ''),
        gender: String(p.gender ?? ''),
        nationality: String(p.nationality ?? ''),
        country: String(p.country ?? ''),
        countryIso2: String(p.country_iso2 ?? ''),
        state: String(p.state ?? ''),
        city: String(p.city ?? ''),
        preferredLanguage: String(p.preferred_language ?? ''),
        timezone: String(p.timezone ?? ''),
        categoryId: (p.category_id as string) ?? '',
        categoryName: String(p.category_name ?? 'Uncategorized'),
        profileStatus: String(p.profile_status ?? 'Active'),
        notes: String(p.notes ?? ''),
      },
      contact: {
        primaryPhone: String(contact.primary_phone ?? ''),
        secondaryPhone: String(contact.secondary_phone ?? ''),
        phoneCountryCode: String(contact.phone_country_code ?? ''),
        primaryEmail: String(contact.primary_email ?? ''),
        secondaryEmail: String(contact.secondary_email ?? ''),
        altEmail: String(contact.alt_email ?? ''),
        website: String(contact.website ?? ''),
        contactPreference: String(contact.contact_preference ?? ''),
        socialLinks: parsedLinks,
      },
      address: {
        street: String(address.street ?? ''),
        apartment: String(address.apartment ?? ''),
        city: String(address.city ?? ''),
        state: String(address.state ?? ''),
        postalCode: String(address.postal_code ?? ''),
        country: String(address.country ?? ''),
        countryCode: String(address.country_code ?? ''),
      },
      account: {
        loginUsername: String(accountRow.login_username ?? ''),
        loginEmail: String(accountRow.login_email ?? ''),
        password: decrypt(accountRow.password_enc),
        accountProvider: String(accountRow.account_provider ?? ''),
        passwordUpdatedAt: (accountRow.password_updated_at as string) ?? null,
        hasPassword: !!accountRow.password_enc,
        accountCreatedAt: String(accountRow.account_created_at ?? ''),
        lastLogin: String(accountRow.last_login ?? ''),
        status: String(accountRow.account_status ?? ''),
        recoveryInfo: decrypt(accountRow.recovery_enc),
        notes: String(accountRow.notes ?? ''),
      },
      professional: {
        occupation: String(professional.occupation ?? ''),
        jobTitle: String(professional.job_title ?? ''),
        company: String(professional.company ?? ''),
        industry: String(professional.industry ?? ''),
        website: String(professional.website ?? ''),
        workEmail: String(professional.work_email ?? ''),
        workPhone: String(professional.work_phone ?? ''),
        notes: String(professional.notes ?? ''),
      },
      custom: {
        fields: customFields.map(
          (f): CustomField => ({
            id: String(f.id),
            label: String(f.label),
            value: Number(f.value_enc) === 1 ? decrypt(f.value) : String(f.value ?? ''),
            type: String(f.field_type ?? 'text') as CustomField['type'],
          }),
        ),
        personalNotes: String(notes.personal_notes ?? ''),
        internalNotes: String(notes.internal_notes ?? ''),
        personalTags,
        fieldMeta: fieldMetaRows.map((r) => ({
          key: String(r.field),
          label: String(r.field),
          updatedAt: String(r.updated_at),
          updatedBy: String(r.updated_by ?? ''),
        })),
      },
      attachments: attachments.map(mapAttachment),
      audit: {
        createdBy: String(p.created_by ?? ''),
        createdById: (p.created_by_user_id as string) ?? null,
        createdAt: String(p.created_at),
        updatedBy: (p.updated_by as string) ?? null,
        updatedById: (p.updated_by_user_id as string) ?? null,
        updatedAt: String(p.updated_at),
        archivedBy: (p.archived_by as string) ?? null,
        archivedAt: (p.archived_at as string) ?? null,
        deletedBy: (p.deleted_by as string) ?? null,
        deletedAt: (p.deleted_at as string) ?? null,
        deleted: false,
        viewCount: Number(p.view_count ?? 0) + (trackViews ? 1 : 0),
        lastViewedAt: lastView?.viewed_at ?? null,
        lastViewedBy: null,
        version: Number(p.version ?? 1),
      },
    }
  }

  getAvatar(id: string): string | null {
    return this.db.value<string>('SELECT avatar_blob FROM profiles WHERE id = ?', [id]) ?? null
  }

  // ---------- create / update ----------

  private validateInput(input: ProfileInput): void {
    const fields: { field: string; message: string }[] = []
    const name = input.basic.fullName.trim()
    if (name.length < 2) fields.push({ field: 'fullName', message: 'Full name is required (min 2 characters).' })
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    const emailPairs: [string, string][] = [
      ['primaryEmail', input.contact.primaryEmail],
      ['secondaryEmail', input.contact.secondaryEmail],
      ['altEmail', input.contact.altEmail],
      ['workEmail', input.professional.workEmail],
      ['loginEmail', input.account.loginEmail],
    ]
    for (const [key, value] of emailPairs) {
      const v = (value ?? '').trim()
      if (v && !emailRe.test(v)) fields.push({ field: key, message: 'Enter a valid email address.' })
    }
    if (input.basic.dob && !/^\d{4}-\d{2}-\d{2}$/.test(input.basic.dob)) {
      fields.push({ field: 'dob', message: 'Date of birth must be YYYY-MM-DD.' })
    }
    const phoneRe = /^[+\d][+\d\s().-]{4,24}$/
    const phonePairs: [string, string][] = [
      ['primaryPhone', input.contact.primaryPhone],
      ['secondaryPhone', input.contact.secondaryPhone],
      ['workPhone', input.professional.workPhone],
    ]
    for (const [key, value] of phonePairs) {
      const v = (value ?? '').trim()
      if (v && !phoneRe.test(v)) fields.push({ field: key, message: 'Enter a valid phone number with country code.' })
    }
    if (fields.length) validationError(fields)
  }

  private flatTracked(input: ProfileInput): { key: string; section: string; field: string; label: string; value: string }[] {
    const out: { key: string; section: string; field: string; label: string; value: string }[] = []
    const push = (section: string, field: string, label: string, value: string | null | undefined) =>
      out.push({ key: `${section}.${field}`, section, field, label, value: (value ?? '').trim() })
    push('basic', 'fullName', 'Full Name', input.basic.fullName)
    push('basic', 'username', 'Username', input.basic.username)
    push('basic', 'dob', 'Date of Birth', input.basic.dob)
    push('basic', 'gender', 'Gender', input.basic.gender)
    push('basic', 'nationality', 'Nationality', input.basic.nationality)
    push('basic', 'country', 'Country', input.basic.country)
    push('basic', 'state', 'State / Province', input.basic.state)
    push('basic', 'city', 'City', input.basic.city)
    push('basic', 'preferredLanguage', 'Preferred Language', input.basic.preferredLanguage)
    push('basic', 'timezone', 'Timezone', input.basic.timezone)
    push('basic', 'profileStatus', 'Profile Status', input.basic.profileStatus)
    push('basic', 'notes', 'Notes', input.basic.notes)
    push('basic', 'tags', 'Tags', input.basic.tags.join(', '))
    push('contact', 'primaryPhone', 'Primary Phone', input.contact.primaryPhone)
    push('contact', 'secondaryPhone', 'Secondary Phone', input.contact.secondaryPhone)
    push('contact', 'phoneCountryCode', 'Phone Country Code', input.contact.phoneCountryCode)
    push('contact', 'primaryEmail', 'Primary Email', input.contact.primaryEmail)
    push('contact', 'secondaryEmail', 'Secondary Email', input.contact.secondaryEmail)
    push('contact', 'altEmail', 'Alternative Email', input.contact.altEmail)
    push('contact', 'website', 'Website', input.contact.website)
    push('contact', 'contactPreference', 'Contact Preferences', input.contact.contactPreference)
    push('address', 'street', 'Street Address', input.address.street)
    push('address', 'apartment', 'Apartment / Suite', input.address.apartment)
    push('address', 'city', 'Address City', input.address.city)
    push('address', 'state', 'Address State', input.address.state)
    push('address', 'postalCode', 'ZIP / Postal Code', input.address.postalCode)
    push('address', 'country', 'Address Country', input.address.country)
    push('address', 'countryCode', 'Address Country Code', input.address.countryCode)
    push('account', 'loginUsername', 'Login Username', input.account.loginUsername)
    push('account', 'loginEmail', 'Login Email', input.account.loginEmail)
    push('account', 'accountProvider', 'Account Provider', input.account.accountProvider)
    push('account', 'accountCreatedAt', 'Account Creation Date', input.account.accountCreatedAt)
    push('account', 'lastLogin', 'Last Login', input.account.lastLogin)
    push('account', 'accountStatus', 'Account Status', input.account.status)
    push('account', 'recoveryInfo', 'Recovery Information', input.account.recoveryInfo)
    push('account', 'notes', 'Account Notes', input.account.notes)
    push('professional', 'occupation', 'Occupation', input.professional.occupation)
    push('professional', 'jobTitle', 'Job Title', input.professional.jobTitle)
    push('professional', 'company', 'Company', input.professional.company)
    push('professional', 'industry', 'Industry', input.professional.industry)
    push('professional', 'website', 'Professional Website', input.professional.website)
    push('professional', 'workEmail', 'Work Email', input.professional.workEmail)
    push('professional', 'workPhone', 'Work Phone', input.professional.workPhone)
    push('professional', 'notes', 'Professional Notes', input.professional.notes)
    push('custom', 'personalNotes', 'Personal Notes', input.custom.personalNotes)
    push('custom', 'internalNotes', 'Internal Notes', input.custom.internalNotes)
    return out
  }

  private currentTracked(id: string): Map<string, string> {
    const map = new Map<string, string>()
    const p = this.db.get<Record<string, unknown>>('SELECT * FROM profiles WHERE id = ?', [id])
    if (!p) return map
    const c = this.db.get<Record<string, unknown>>('SELECT * FROM profile_contacts WHERE profile_id = ?', [id]) ?? {}
    const a = this.db.get<Record<string, unknown>>('SELECT * FROM profile_addresses WHERE profile_id = ?', [id]) ?? {}
    const ac = this.db.get<Record<string, unknown>>('SELECT * FROM profile_accounts WHERE profile_id = ?', [id]) ?? {}
    const pr = this.db.get<Record<string, unknown>>('SELECT * FROM profile_professional WHERE profile_id = ?', [id]) ?? {}
    const n = this.db.get<Record<string, unknown>>('SELECT * FROM profile_notes WHERE profile_id = ?', [id]) ?? {}
    const set = (k: string, v: unknown) => map.set(k, String(v ?? '').trim())
    set('basic.fullName', p.full_name); set('basic.username', p.username); set('basic.dob', p.dob); set('basic.gender', p.gender)
    set('basic.nationality', p.nationality); set('basic.country', p.country); set('basic.state', p.state); set('basic.city', p.city)
    set('basic.preferredLanguage', p.preferred_language); set('basic.timezone', p.timezone); set('basic.profileStatus', p.profile_status)
    set('basic.notes', p.notes); set('basic.tags', p.tags_text)
    set('contact.primaryPhone', c.primary_phone); set('contact.secondaryPhone', c.secondary_phone); set('contact.phoneCountryCode', c.phone_country_code)
    set('contact.primaryEmail', c.primary_email); set('contact.secondaryEmail', c.secondary_email); set('contact.altEmail', c.alt_email)
    set('contact.website', c.website); set('contact.contactPreference', c.contact_preference)
    set('address.street', a.street); set('address.apartment', a.apartment); set('address.city', a.city); set('address.state', a.state)
    set('address.postalCode', a.postal_code); set('address.country', a.country); set('address.countryCode', a.country_code)
    set('account.loginUsername', ac.login_username); set('account.loginEmail', ac.login_email); set('account.accountProvider', ac.account_provider)
    set('account.accountCreatedAt', ac.account_created_at); set('account.lastLogin', ac.last_login); set('account.accountStatus', ac.account_status)
    set('account.recoveryInfo', ac.recovery_enc ? '[encrypted]' : ''); set('account.notes', ac.notes)
    set('professional.occupation', pr.occupation); set('professional.jobTitle', pr.job_title); set('professional.company', pr.company)
    set('professional.industry', pr.industry); set('professional.website', pr.website); set('professional.workEmail', pr.work_email)
    set('professional.workPhone', pr.work_phone); set('professional.notes', pr.notes)
    set('custom.personalNotes', n.personal_notes); set('custom.internalNotes', n.internal_notes)
    return map
  }

  private persistSections(profileId: string, input: ProfileInput, actor: Actor, now: string, passwordChanged: boolean): void {
    const b = input.basic
    this.db.run(
      `UPDATE profiles SET full_name=?, username=?, dob=?, gender=?, nationality=?, country=?, country_iso2=?, state=?, city=?,
              preferred_language=?, timezone=?, profile_status=?, category_id=?, notes=?, updated_by=?, updated_by_user_id=?, updated_at=?, version=version+1
       WHERE id = ?`,
      [
        b.fullName.trim(), b.username.trim(), b.dob, b.gender, b.nationality.trim(), b.country.trim(), b.countryIso2.trim().toUpperCase(),
        b.state.trim(), b.city.trim(), b.preferredLanguage, b.timezone, b.profileStatus || 'Active', b.categoryId || null, b.notes,
        actor.username, actor.id, now, profileId,
      ],
    )
    this.db.run(
      `INSERT INTO profile_contacts(id, profile_id, primary_phone, secondary_phone, phone_country_code, primary_email, secondary_email, alt_email, website, contact_preference, social_links, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(profile_id) DO UPDATE SET primary_phone=excluded.primary_phone, secondary_phone=excluded.secondary_phone, phone_country_code=excluded.phone_country_code, primary_email=excluded.primary_email, secondary_email=excluded.secondary_email, alt_email=excluded.alt_email, website=excluded.website, contact_preference=excluded.contact_preference, social_links=excluded.social_links, updated_at=excluded.updated_at`,
      [
        crypto.randomUUID(), profileId, input.contact.primaryPhone.trim(), input.contact.secondaryPhone.trim(), input.contact.phoneCountryCode.trim(),
        input.contact.primaryEmail.trim(), input.contact.secondaryEmail.trim(), input.contact.altEmail.trim(), input.contact.website.trim(),
        input.contact.contactPreference, JSON.stringify(input.contact.socialLinks ?? []), now,
      ],
    )
    this.db.run(
      `INSERT INTO profile_addresses(id, profile_id, street, apartment, city, state, postal_code, country, country_code, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(profile_id) DO UPDATE SET street=excluded.street, apartment=excluded.apartment, city=excluded.city, state=excluded.state, postal_code=excluded.postal_code, country=excluded.country, country_code=excluded.country_code, updated_at=excluded.updated_at`,
      [crypto.randomUUID(), profileId, input.address.street.trim(), input.address.apartment.trim(), input.address.city.trim(), input.address.state.trim(), input.address.postalCode.trim(), input.address.country.trim(), input.address.countryCode.trim(), now],
    )
    const passwordEnc = passwordChanged ? encryptField(input.account.password, this.fieldKey, 'account') : undefined
    const recoveryEnc = input.account.recoveryInfo
      ? encryptField(input.account.recoveryInfo, this.fieldKey, 'recovery')
      : this.db.value<string>('SELECT recovery_enc FROM profile_accounts WHERE profile_id = ?', [profileId]) ?? ''
    this.db.run(
      `INSERT INTO profile_accounts(id, profile_id, login_username, login_email, password_enc, password_format, password_updated_at, account_provider, account_created_at, last_login, account_status, recovery_enc, notes, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(profile_id) DO UPDATE SET
         login_username=excluded.login_username, login_email=excluded.login_email,
         password_enc=COALESCE(?, profile_accounts.password_enc),
         password_format=CASE WHEN ? THEN 'v1' ELSE profile_accounts.password_format END,
         password_updated_at=CASE WHEN ? THEN ? ELSE profile_accounts.password_updated_at END,
         account_provider=excluded.account_provider, account_created_at=excluded.account_created_at, last_login=excluded.last_login,
         account_status=excluded.account_status, recovery_enc=excluded.recovery_enc, notes=excluded.notes, updated_at=excluded.updated_at`,
      [
        crypto.randomUUID(), profileId, input.account.loginUsername.trim(), input.account.loginEmail.trim(),
        passwordEnc ?? '', 'v1', now,
        input.account.accountProvider.trim(), input.account.accountCreatedAt.trim(), input.account.lastLogin.trim(),
        input.account.status, recoveryEnc, input.account.notes, now,
        passwordEnc ?? null,
        passwordChanged ? 1 : 0,
        passwordChanged ? 1 : 0, now,
      ],
    )
    if (input.account.clearPassword) {
      this.db.run(`UPDATE profile_accounts SET password_enc = '', password_format = '', password_updated_at = NULL WHERE profile_id = ?`, [profileId])
    }
    this.db.run(
      `INSERT INTO profile_professional(id, profile_id, occupation, job_title, company, industry, website, work_email, work_phone, notes, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(profile_id) DO UPDATE SET occupation=excluded.occupation, job_title=excluded.job_title, company=excluded.company, industry=excluded.industry, website=excluded.website, work_email=excluded.work_email, work_phone=excluded.work_phone, notes=excluded.notes, updated_at=excluded.updated_at`,
      [crypto.randomUUID(), profileId, input.professional.occupation.trim(), input.professional.jobTitle.trim(), input.professional.company.trim(), input.professional.industry.trim(), input.professional.website.trim(), input.professional.workEmail.trim(), input.professional.workPhone.trim(), input.professional.notes, now],
    )
    this.db.run(
      `INSERT INTO profile_notes(profile_id, personal_notes, internal_notes, personal_tags, updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(profile_id) DO UPDATE SET personal_notes=excluded.personal_notes, internal_notes=excluded.internal_notes, personal_tags=excluded.personal_tags, updated_at=excluded.updated_at`,
      [profileId, input.custom.personalNotes, input.custom.internalNotes, JSON.stringify(input.custom.personalTags ?? []), now],
    )
    this.db.run('DELETE FROM profile_custom_fields WHERE profile_id = ?', [profileId])
    for (const f of input.custom.fields.filter((f) => f.label.trim())) {
      const secret = f.type === 'secret'
      this.db.run(
        'INSERT INTO profile_custom_fields(id, profile_id, label, value, value_enc, field_type, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [
          f.id ?? crypto.randomUUID(),
          profileId,
          f.label.trim().slice(0, 120),
          secret ? encryptField(f.value, this.fieldKey, 'custom') : f.value,
          secret ? 1 : 0,
          f.type,
          actor.username,
          now,
        ],
      )
    }
    this.syncTags(profileId, input.basic.tags, actor.username)
  }

  create(input: ProfileInput, actor: Actor): ProfileDetail {
    this.validateInput(input)
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const code = this.nextProfileCode()
    const passwordChanged = !!input.account.password
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO profiles(id, profile_code, full_name, username, dob, gender, nationality, country, country_iso2, state, city, preferred_language,
                              timezone, profile_status, category_id, notes, status, is_demo, source, view_count,
                              created_by, created_by_user_id, created_at, updated_by, updated_by_user_id, updated_at, version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, code, input.basic.fullName.trim(), input.basic.username.trim(), input.basic.dob, input.basic.gender,
          input.basic.nationality.trim(), input.basic.country.trim(), input.basic.countryIso2.trim().toUpperCase(), input.basic.state.trim(), input.basic.city.trim(),
          input.basic.preferredLanguage, input.basic.timezone, input.basic.profileStatus || 'Active', input.basic.categoryId || null, input.basic.notes,
          'active', 0, 'manual', 0, actor.username, actor.id, now, actor.username, actor.id, now, 1,
        ],
      )
      this.persistSections(id, input, actor, now, passwordChanged)
      const tracked = this.flatTracked(input)
      for (const section of ['basic', 'contact', 'address', 'account', 'professional', 'custom']) {
        this.fieldMetaUpsert(
          id,
          section,
          tracked.filter((f) => f.section === section).map((f) => ({ field: f.field, label: f.label })),
          actor,
          now,
        )
      }
      this.syncFts(id)
    })
    this.audit.record(actor, {
      eventType: 'PROFILE_CREATED',
      targetType: 'profile',
      targetId: id,
      targetLabel: `${input.basic.fullName.trim()} (${code})`,
      detail: `Profile ${code} created`,
    })
    return this.get(id, actor, { trackView: false })
  }

  update(id: string, input: ProfileInput, actor: Actor): UpdateProfileResult {
    this.validateInput(input)
    const existing = this.db.get<{ id: string; profile_code: string; full_name: string }>(
      'SELECT id, profile_code, full_name FROM profiles WHERE id = ? AND deleted_at IS NULL',
      [id],
    )
    if (!existing) throw new AppError('NOT_FOUND', 'Profile not found.')
    const now = new Date().toISOString()
    const passwordChanged = !!input.account.password
    const recoveryChanged = input.account.recoveryInfo !== this.decryptRecovery(id) && input.account.recoveryInfo !== ''

    const before = this.currentTracked(id)
    const after = this.flatTracked(input)
    const events: { profileId: string; section: string; field: string; label: string; oldValue: string | null; newValue: string | null; action: string; actor: Actor; at: string }[] = []
    const auditEvents: { field: string; label: string; oldValue: string | null; newValue: string | null }[] = []

    for (const f of after) {
      if (f.key === 'account.recoveryInfo') {
        if (recoveryChanged) {
          events.push({ profileId: id, section: 'account', field: 'recoveryInfo', label: f.label, oldValue: '[encrypted]', newValue: '[encrypted]', action: 'FIELD_UPDATED', actor, at: now })
          auditEvents.push({ field: f.key, label: f.label, oldValue: '[encrypted]', newValue: '[encrypted]' })
        }
        continue
      }
      const prev = before.get(f.key) ?? ''
      if (prev === f.value) continue
      events.push({ profileId: id, section: f.section, field: f.field, label: f.label, oldValue: prev || null, newValue: f.value || null, action: 'FIELD_UPDATED', actor, at: now })
      auditEvents.push({ field: f.key, label: f.label, oldValue: prev || null, newValue: f.value || null })
    }
    if (passwordChanged) {
      events.push({ profileId: id, section: 'account', field: 'password', label: 'Account Password', oldValue: 'set', newValue: 'set', action: 'FIELD_UPDATED', actor, at: now })
      auditEvents.push({ field: 'account.password', label: 'Account Password', oldValue: '[changed]', newValue: '[changed]' })
    }
    if (input.account.clearPassword) {
      events.push({ profileId: id, section: 'account', field: 'password', label: 'Account Password', oldValue: 'set', newValue: null, action: 'FIELD_UPDATED', actor, at: now })
      auditEvents.push({ field: 'account.password', label: 'Account Password', oldValue: '[cleared]', newValue: null })
    }

    this.db.transaction(() => {
      this.persistSections(id, input, actor, now, passwordChanged)
      this.recordHistory(events)
      const changedSectionField = new Set(events.map((e) => `${e.section}.${e.field}`))
      const tracked = this.flatTracked(input)
      for (const section of ['basic', 'contact', 'address', 'account', 'professional', 'custom']) {
        const changed = tracked.filter((f) => f.section === section && changedSectionField.has(`${f.section}.${f.field}`))
        if (section === 'account' && (passwordChanged || input.account.clearPassword)) {
          changed.push({ key: 'account.password', section: 'account', field: 'password', label: 'Account Password', value: 'set' })
        }
        if (changed.length) {
          this.fieldMetaUpsert(id, section, changed.map((f) => ({ field: f.field, label: f.label })), actor, now)
        }
      }
      this.syncFts(id)
    })

    if (auditEvents.length) {
      this.audit.recordMany(
        actor,
        auditEvents.map((e) => ({
          eventType: 'FIELD_UPDATED',
          targetType: 'profile' as const,
          targetId: id,
          targetLabel: existing.full_name,
          field: e.field,
          oldValue: e.oldValue,
          newValue: e.newValue,
        })),
      )
      this.audit.record(actor, {
        eventType: 'PROFILE_UPDATED',
        targetType: 'profile',
        targetId: id,
        targetLabel: existing.full_name,
        detail: `${auditEvents.length} field(s) updated`,
      })
    }
    return { id, changes: auditEvents.length }
  }

  // ---------- lifecycle ----------

  setStatus(id: string, action: 'archive' | 'restore' | 'delete', actor: Actor): void {
    const p = this.db.get<{ id: string; full_name: string; status: string; deleted_at: string | null }>(
      'SELECT id, full_name, status, deleted_at FROM profiles WHERE id = ?',
      [id],
    )
    if (!p) throw new AppError('NOT_FOUND', 'Profile not found.')
    if (p.deleted_at) throw new AppError('NOT_FOUND', 'Profile not found.')
    const now = new Date().toISOString()
    if (action === 'archive') {
      if (p.status === 'archived') return
      this.db.run('UPDATE profiles SET status = ?, archived_by = ?, archived_at = ?, updated_by = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?', [
        'archived', actor.username, now, actor.username, actor.id, now, id,
      ])
      this.audit.record(actor, { eventType: 'PROFILE_ARCHIVED', targetType: 'profile', targetId: id, targetLabel: p.full_name, detail: 'Profile archived' })
    } else if (action === 'restore') {
      this.db.run('UPDATE profiles SET status = ?, archived_by = NULL, archived_at = NULL, updated_by = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?', [
        'active', actor.username, actor.id, now, id,
      ])
      this.audit.record(actor, { eventType: 'PROFILE_RESTORED', targetType: 'profile', targetId: id, targetLabel: p.full_name, detail: 'Profile restored from archive' })
    } else {
      this.db.run('UPDATE profiles SET deleted_by = ?, deleted_at = ?, status = ? WHERE id = ?', [actor.username, now, 'archived', id])
      // Soft-delete keeps the row for the ledger; intelligence stores must
      // not keep finding (or identifying) a removed person.
      this.db.run('DELETE FROM photo_tokens WHERE profile_id = ?', [id])
      this.db.run('DELETE FROM document_text WHERE profile_id = ?', [id])
      this.db.run('DELETE FROM text_embeddings WHERE profile_id = ?', [id])
      this.audit.record(actor, { eventType: 'PROFILE_DELETED', targetType: 'profile', targetId: id, targetLabel: p.full_name, detail: 'Profile soft-deleted, face/photo/document intelligence purged' })
    }
    this.syncFts(id)
  }

  toggleFavorite(id: string, actor: Actor): { isFavorite: boolean } {
    const exists = this.db.get<{ id: string }>('SELECT id FROM profiles WHERE id = ? AND deleted_at IS NULL', [id])
    if (!exists) throw new AppError('NOT_FOUND', 'Profile not found.')
    const current = this.db.value<number>('SELECT 1 FROM favorites WHERE user_id = ? AND profile_id = ?', [actor.id, id])
    if (current) {
      this.db.run('DELETE FROM favorites WHERE user_id = ? AND profile_id = ?', [actor.id, id])
      this.audit.record(actor, { eventType: 'PROFILE_UNFAVORITED', targetType: 'profile', targetId: id })
      return { isFavorite: false }
    }
    this.db.run('INSERT INTO favorites(user_id, profile_id, created_at) VALUES (?,?,?)', [actor.id, id, new Date().toISOString()])
    this.audit.record(actor, { eventType: 'PROFILE_FAVORITED', targetType: 'profile', targetId: id })
    return { isFavorite: true }
  }

  duplicate(id: string, actor: Actor): ProfileDetail {
    const p = this.get(id, actor, { trackView: false })
    const base = p.basic.username ? p.basic.username.replace(/-copy(-\d+)?$/, '') : ''
    let username = base ? `${base}-copy` : ''
    if (username) {
      let n = 1
      let candidate = username
      while (this.db.value<number>('SELECT 1 FROM profiles WHERE username = ? COLLATE NOCASE AND deleted_at IS NULL', [candidate])) {
        n += 1
        candidate = `${base}-copy-${n}`
      }
      username = candidate
    }
    const input: ProfileInput = {
      basic: { ...p.basic, username, profileStatus: 'Active', tags: p.tags.map((t) => t.name) },
      contact: { ...p.contact },
      address: { ...p.address },
      account: {
        loginUsername: p.account.loginUsername,
        loginEmail: p.account.loginEmail,
        password: p.account.password,
        clearPassword: false,
        accountProvider: p.account.accountProvider,
        accountCreatedAt: p.account.accountCreatedAt,
        lastLogin: p.account.lastLogin,
        status: p.account.status,
        recoveryInfo: p.account.recoveryInfo,
        notes: p.account.notes,
      },
      professional: { ...p.professional },
      custom: {
        fields: p.custom.fields,
        personalNotes: p.custom.personalNotes,
        internalNotes: p.custom.internalNotes,
        personalTags: p.custom.personalTags,
      },
    }
    const copy = this.create(input, actor)
    // Carry face/photo intelligence to the duplicate automatically.
    const srcTokens = this.db.all<Record<string, unknown>>('SELECT * FROM photo_tokens WHERE profile_id = ?', [id])
    const now = new Date().toISOString()
    for (const r of srcTokens) {
      this.db.run(
        `INSERT INTO photo_tokens(id, profile_id, image_id, kind, phash, ahash, face_detected, face_phash, face_box, face_geom, face_desc, histogram, status, attempts, error, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          copy.id,
          String(r.image_id ?? '') || null,
          String(r.kind ?? 'gallery'),
          (r.phash as string) ?? null,
          (r.ahash as string) ?? null,
          Number(r.face_detected ?? 0),
          (r.face_phash as string) ?? null,
          (r.face_box as string) ?? null,
          (r.face_geom as string) ?? null,
          (r.face_desc as string) ?? null,
          (r.histogram as string) ?? null,
          String(r.status ?? 'done'),
          Number(r.attempts ?? 0),
          (r.error as string) ?? null,
          now,
          now,
        ],
      )
    }
    this.audit.record(actor, {
      eventType: 'PROFILE_DUPLICATED',
      targetType: 'profile',
      targetId: copy.id,
      targetLabel: input.basic.fullName,
      detail: `Duplicated from ${p.profileCode}`,
    })
    return copy
  }

  // ---------- images & attachments ----------

  private checkDataUrl(dataUrl: string, maxBytes: number): { ok: boolean; mime: string; bytes: number } {
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl)
    if (!m) return { ok: false, mime: '', bytes: 0 }
    const bytes = Math.floor((m[2].length * 3) / 4)
    return { ok: bytes <= maxBytes, mime: m[1], bytes }
  }

  setAvatar(id: string, dataUrl: string | null, actor: Actor): void {
    const p = this.db.get<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = ? AND deleted_at IS NULL', [id])
    if (!p) throw new AppError('NOT_FOUND', 'Profile not found.')
    if (dataUrl === null) {
      this.db.run('UPDATE profiles SET avatar_blob = NULL, updated_by = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?', [actor.username, actor.id, new Date().toISOString(), id])
      this.audit.record(actor, { eventType: 'PROFILE_IMAGE_CHANGED', targetType: 'profile', targetId: id, targetLabel: p.full_name, detail: 'Profile photograph removed' })
      this.photoRemovedHook?.(id, null, 'avatar')
      return
    }
    const check = this.checkDataUrl(dataUrl, 2 * 1024 * 1024)
    if (!check.ok) throw new AppError('VALIDATION', 'Image exceeds the 2 MB limit or is not a valid data URL.')
    if (!/^image\/(jpeg|png|webp)$/.test(check.mime)) throw new AppError('VALIDATION', 'Only JPG, PNG and WebP images are supported.')
    this.db.run('UPDATE profiles SET avatar_blob = ?, updated_by = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?', [dataUrl, actor.username, actor.id, new Date().toISOString(), id])
    this.audit.record(actor, { eventType: 'PROFILE_IMAGE_CHANGED', targetType: 'profile', targetId: id, targetLabel: p.full_name, detail: 'Profile photograph updated' })
    this.photoHook?.(id, null, 'avatar')
  }

  addGalleryImage(id: string, name: string, dataUrl: string, actor: Actor): string {
    const p = this.db.get<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = ? AND deleted_at IS NULL', [id])
    if (!p) throw new AppError('NOT_FOUND', 'Profile not found.')
    const check = this.checkDataUrl(dataUrl, 8 * 1024 * 1024)
    if (!check.ok) throw new AppError('VALIDATION', 'Image exceeds the 8 MB limit.')
    const imageId = crypto.randomUUID()
    this.db.run('INSERT INTO profile_images(id, profile_id, kind, name, mime, size, blob, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)', [
      imageId, id, 'gallery', name.slice(0, 200) || 'image', check.mime, check.bytes, dataUrl, actor.username, new Date().toISOString(),
    ])
    this.audit.record(actor, { eventType: 'ATTACHMENT_ADDED', targetType: 'profile', targetId: id, targetLabel: p.full_name, detail: `Image ${name}` })
    this.photoHook?.(id, imageId, 'gallery')
    return imageId
  }

  addAttachment(id: string, name: string, mime: string, dataUrl: string, category: string, actor: Actor): string {
    const p = this.db.get<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = ? AND deleted_at IS NULL', [id])
    if (!p) throw new AppError('NOT_FOUND', 'Profile not found.')
    const check = this.checkDataUrl(dataUrl, 12 * 1024 * 1024)
    if (!check.ok) throw new AppError('VALIDATION', 'Attachment exceeds the 12 MB limit.')
    const attId = crypto.randomUUID()
    this.db.run('INSERT INTO attachments(id, profile_id, category, name, mime, size, blob, uploaded_by, uploaded_by_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [
      attId, id, category.slice(0, 60) || 'documents', name.slice(0, 200) || 'file', mime.slice(0, 120), check.bytes, dataUrl, actor.username, actor.id, new Date().toISOString(),
    ])
    this.audit.record(actor, { eventType: 'ATTACHMENT_ADDED', targetType: 'profile', targetId: id, targetLabel: p.full_name, detail: `Attachment ${name}` })
    if (/^image\/(jpeg|png|webp)$/.test(mime)) {
      this.photoHook?.(id, attId, 'attachment')
      this.ocrHook?.(attId, id)
    }
    return attId
  }

  removeAttachment(attachmentId: string, actor: Actor): void {
    const row = this.db.get<{ id: string; profile_id: string; name: string }>('SELECT id, profile_id, name FROM attachments WHERE id = ?', [attachmentId])
    if (!row) throw new AppError('NOT_FOUND', 'Attachment not found.')
    this.db.run('DELETE FROM attachments WHERE id = ?', [attachmentId])
    this.audit.record(actor, { eventType: 'ATTACHMENT_REMOVED', targetType: 'profile', targetId: row.profile_id, detail: `Attachment ${row.name} removed` })
  }

  removeGalleryImage(imageId: string, actor: Actor): void {
    const row = this.db.get<{ id: string; profile_id: string; name: string }>('SELECT id, profile_id, name FROM profile_images WHERE id = ?', [imageId])
    if (!row) throw new AppError('NOT_FOUND', 'Image not found.')
    this.db.run('DELETE FROM profile_images WHERE id = ?', [imageId])
    this.audit.record(actor, { eventType: 'ATTACHMENT_REMOVED', targetType: 'profile', targetId: row.profile_id, detail: `Image ${row.name} removed` })
    this.photoRemovedHook?.(row.profile_id, imageId, 'gallery')
  }

  // ---------- history & copy ----------

  fieldHistory(id: string): FieldHistoryEntry[] {
    return this.db.all<Record<string, unknown>>(
      'SELECT id, field, field_label, old_value, new_value, action, actor_username, created_at FROM profile_field_history WHERE profile_id = ? ORDER BY created_at DESC LIMIT 500',
      [id],
    ).map((r) => ({
      id: String(r.id),
      field: String(r.field),
      fieldLabel: String(r.field_label),
      oldValue: (r.old_value as string) ?? null,
      newValue: (r.new_value as string) ?? null,
      action: String(r.action),
      actorUsername: String(r.actor_username),
      createdAt: String(r.created_at),
    }))
  }

  profileAudit(id: string) {
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT id, event_type, actor_id, actor_username, target_type, target_id, target_label, field, old_value, new_value, detail, session_ref, device_name, created_at
       FROM audit_logs WHERE target_id = ? ORDER BY seq DESC LIMIT 200`,
      [id],
    )
    return rows.map((r) => ({
      id: String(r.id),
      eventType: String(r.event_type),
      actorId: (r.actor_id as string) ?? null,
      actorUsername: String(r.actor_username),
      targetType: String(r.target_type),
      targetId: (r.target_id as string) ?? null,
      targetLabel: (r.target_label as string) ?? null,
      field: (r.field as string) ?? null,
      oldValue: (r.old_value as string) ?? null,
      newValue: (r.new_value as string) ?? null,
      detail: (r.detail as string) ?? null,
      sessionRef: (r.session_ref as string) ?? null,
      deviceName: (r.device_name as string) ?? null,
      createdAt: String(r.created_at),
    }))
  }

  composeCopyText(id: string, includeSecrets: boolean): string {
    const d = this.get(id, { id: null, username: 'copy' }, { trackView: false })
    const line = (label: string, value: string | null | undefined) => (value && String(value).trim() ? `${label}: ${value}` : null)
    const rows = [
      line('Full Name', d.basic.fullName),
      line('Username', d.basic.username),
      line('Profile ID', d.profileCode),
      line('Date of Birth', d.basic.dob),
      line('Gender', d.basic.gender),
      line('Nationality', d.basic.nationality),
      line('Country', d.basic.country),
      line('State / Province', d.basic.state),
      line('City', d.basic.city),
      line('Preferred Language', d.basic.preferredLanguage),
      line('Timezone', d.basic.timezone),
      line('Tags', d.tags.map((t) => t.name).join(', ')),
      line('Primary Phone', d.contact.primaryPhone),
      line('Secondary Phone', d.contact.secondaryPhone),
      line('Primary Email', d.contact.primaryEmail),
      line('Secondary Email', d.contact.secondaryEmail),
      line('Alternative Email', d.contact.altEmail),
      line('Website', d.contact.website),
      line('Contact Preferences', d.contact.contactPreference),
      line('Street Address', d.address.street),
      line('Apartment / Suite', d.address.apartment),
      line('Address City', d.address.city),
      line('Address State', d.address.state),
      line('ZIP / Postal Code', d.address.postalCode),
      line('Address Country', d.address.country),
      line('Full Address', fullAddress(d)),
      line('Login Username', d.account.loginUsername),
      line('Login Email', d.account.loginEmail),
      includeSecrets && d.account.password ? `Account Password: ${d.account.password}` : null,
      line('Account Provider', d.account.accountProvider),
      line('Account Creation Date', d.account.accountCreatedAt),
      line('Last Login', d.account.lastLogin),
      line('Account Status', d.account.status),
      line('Occupation', d.professional.occupation),
      line('Job Title', d.professional.jobTitle),
      line('Company', d.professional.company),
      line('Industry', d.professional.industry),
      line('Professional Website', d.professional.website),
      line('Work Email', d.professional.workEmail),
      line('Work Phone', d.professional.workPhone),
      ...d.custom.fields.map((f) => line(f.label, f.value)),
      line('Personal Notes', d.custom.personalNotes),
      line('Internal Notes', d.custom.internalNotes),
      line('Notes', d.basic.notes),
      '---',
      `Created By: ${d.audit.createdBy} @ ${d.audit.createdAt}`,
      `Last Updated By: ${d.audit.updatedBy ?? ' - '} @ ${d.audit.updatedAt}`,
    ]
    return rows.filter(Boolean).join('\n')
  }
}

export function mapListRow(r: ListRow): ProfileListItem {
  return {
    id: r.id,
    profileCode: r.profile_code,
    fullName: r.full_name,
    username: r.username,
    country: r.country,
    countryIso2: r.country_iso2,
    city: r.city,
    state: r.state,
    phone: r.primary_phone ?? '',
    email: r.primary_email ?? '',
    categoryId: r.category_id ?? '',
    categoryName: r.category_name ?? 'Uncategorized',
    categoryColor: r.category_color ?? '#555B65',
    avatar: r.avatar_blob,
    gender: r.gender,
    status: r.status,
    dob: r.dob,
    isDemo: Number(r.is_demo) === 1,
    isFavorite: Number(r.is_favorite) === 1,
    createdByUsername: r.created_by_username ?? r.created_by ?? 'system',
    createdAt: r.created_at,
    updatedByUsername: r.updated_by_username ?? null,
    updatedAt: r.updated_at,
    viewCount: r.view_count,
    lastViewedAt: r.last_viewed_at,
  }
}

export function fullAddress(d: ProfileDetail): string {
  const parts = [d.address.street, d.address.apartment, d.address.city, d.address.state, d.address.postalCode, d.address.country]
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.join(', ')
}
