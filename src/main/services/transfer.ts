import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Db } from '../db/sqlite'
import type {
  Actor,
} from './audit'
import type { AuditService } from './audit'
import type { ProfilesService } from './profiles'
import type { SettingsService } from './settings'
import { AppError } from '../lib/errors'
import { presetDir, ensureWritableDir } from '../lib/vision'
import { FIELD_ALIASES } from '../nlp/engine'
import type { ImportPreview, ImportResult, ProfileDetail, ProfileInput, ProfileListItem } from '../../shared/types'
import { fullAddress } from './profiles'

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf'

interface FlatRow {
  [key: string]: string
}

const EXPORT_COLUMNS: { header: string; key: string }[] = [
  { header: 'Profile ID', key: 'profileCode' },
  { header: 'Full Name', key: 'fullName' },
  { header: 'Username', key: 'username' },
  { header: 'Date of Birth', key: 'dob' },
  { header: 'Gender', key: 'gender' },
  { header: 'Nationality', key: 'nationality' },
  { header: 'Country', key: 'country' },
  { header: 'Country Code', key: 'countryIso2' },
  { header: 'State / Province', key: 'state' },
  { header: 'City', key: 'city' },
  { header: 'Preferred Language', key: 'preferredLanguage' },
  { header: 'Timezone', key: 'timezone' },
  { header: 'Category', key: 'category' },
  { header: 'Tags', key: 'tags' },
  { header: 'Primary Phone', key: 'primaryPhone' },
  { header: 'Secondary Phone', key: 'secondaryPhone' },
  { header: 'Primary Email', key: 'primaryEmail' },
  { header: 'Secondary Email', key: 'secondaryEmail' },
  { header: 'Website', key: 'website' },
  { header: 'Street Address', key: 'street' },
  { header: 'Apartment', key: 'apartment' },
  { header: 'Address City', key: 'addressCity' },
  { header: 'Address State', key: 'addressState' },
  { header: 'Postal Code', key: 'postalCode' },
  { header: 'Address Country', key: 'addressCountry' },
  { header: 'Full Address', key: 'fullAddress' },
  { header: 'Occupation', key: 'occupation' },
  { header: 'Company', key: 'company' },
  { header: 'Industry', key: 'industry' },
  { header: 'Login Username', key: 'loginUsername' },
  { header: 'Login Email', key: 'loginEmail' },
  { header: 'Account Provider', key: 'accountProvider' },
  { header: 'Account Status', key: 'accountStatus' },
  { header: 'Created By', key: 'createdBy' },
  { header: 'Created At', key: 'createdAt' },
  { header: 'Updated At', key: 'updatedAt' },
  { header: 'Notes', key: 'notes' },
]

function flatten(d: ProfileDetail, includeSensitive: boolean): FlatRow {
  const row: FlatRow = {
    profileCode: d.profileCode,
    fullName: d.basic.fullName,
    username: d.basic.username,
    dob: d.basic.dob,
    gender: d.basic.gender,
    nationality: d.basic.nationality,
    country: d.basic.country,
    countryIso2: d.basic.countryIso2,
    state: d.basic.state,
    city: d.basic.city,
    preferredLanguage: d.basic.preferredLanguage,
    timezone: d.basic.timezone,
    category: d.tags.length ? d.tags.map((t) => t.name).join(', ') : d.basic.categoryId ? '' : '',
    tags: d.tags.map((t) => t.name).join(', '),
    primaryPhone: d.contact.primaryPhone,
    secondaryPhone: d.contact.secondaryPhone,
    primaryEmail: d.contact.primaryEmail,
    secondaryEmail: d.contact.secondaryEmail,
    website: d.contact.website,
    street: d.address.street,
    apartment: d.address.apartment,
    addressCity: d.address.city,
    addressState: d.address.state,
    postalCode: d.address.postalCode,
    addressCountry: d.address.country,
    fullAddress: fullAddress(d),
    occupation: d.professional.occupation,
    company: d.professional.company,
    industry: d.professional.industry,
    loginUsername: d.account.loginUsername,
    loginEmail: d.account.loginEmail,
    accountProvider: d.account.accountProvider,
    accountStatus: d.account.status,
    createdBy: d.audit.createdBy,
    createdAt: d.audit.createdAt,
    updatedAt: d.audit.updatedAt,
    notes: d.basic.notes,
  }
  if (includeSensitive) row.password = d.account.password
  return row
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function toCsv(rows: FlatRow[], columns: { header: string; key: string }[]): string {
  const head = columns.map((c) => csvEscape(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => csvEscape(String(r[c.key] ?? ''))).join(','))
  return [head, ...body].join('\r\n')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function suggestMapping(columns: string[]): Record<string, string> {
  const aliasIndex = new Map<string, string>()
  for (const def of FIELD_ALIASES) {
    for (const alias of def.aliases) {
      aliasIndex.set(normalizeHeader(alias), def.key)
    }
  }
  const direct: Record<string, string> = {
    profileid: 'profileCode', profilecode: 'profileCode', id: 'profileCode',
    fullname: 'fullName', firstname: 'fullName', name: 'fullName', displayname: 'fullName',
    birthdate: 'dob', dob: 'dob', dateofbirth: 'dob', gender: 'gender', sex: 'gender',
    nationality: 'nationality', country: 'country', countrycode: 'countryIso2', iso2: 'countryIso2',
    state: 'state', province: 'state', region: 'state', city: 'city', town: 'city',
    preferredlanguage: 'preferredLanguage', language: 'preferredLanguage', timezone: 'timezone', tz: 'timezone',
    category: 'category', type: 'category', tags: 'tags', notes: 'notes',
    phone: 'primaryPhone', phonenumber: 'primaryPhone', mobile: 'primaryPhone', cell: 'primaryPhone', telephone: 'primaryPhone',
    secondaryphone: 'secondaryPhone', altphone: 'secondaryPhone',
    email: 'primaryEmail', emailaddress: 'primaryEmail', mail: 'primaryEmail', primaryemail: 'primaryEmail',
    secondaryemail: 'secondaryEmail', alternateemail: 'secondaryEmail', altemail: 'secondaryEmail',
    website: 'website', url: 'website', site: 'website',
    street: 'street', streetaddress: 'street', address: 'street', apartment: 'apartment', apt: 'apartment', suite: 'apartment',
    addresscity: 'addressCity', addressstate: 'addressState', postalcode: 'postalCode', zip: 'postalCode', zipcode: 'postalCode', postcode: 'postalCode',
    addresscountry: 'addressCountry', occupation: 'occupation', jobtitle: 'jobTitle', title: 'jobTitle',
    company: 'company', employer: 'company', industry: 'industry', sector: 'industry',
    loginusername: 'loginUsername', loginemail: 'loginEmail', accountprovider: 'accountProvider', accountstatus: 'accountStatus',
    login: 'loginUsername', username: 'username', user: 'username', handle: 'username',
    createdby: 'createdBy', createdat: 'createdAt', updatedat: 'updatedAt',
  }
  const mapping: Record<string, string> = {}
  for (const col of columns) {
    const norm = normalizeHeader(col)
    const hit = direct[norm] ?? aliasIndex.get(norm)
    if (hit) mapping[col] = hit
  }
  return mapping
}

export class TransferService {
  constructor(
    private db: Db,
    private profiles: ProfilesService,
    private audit: AuditService,
    private settings: SettingsService,
    private fieldKey: Buffer,
    private exportsDir: string,
  ) {}

  // ---------- export ----------

  private exportRows(list: ProfileListItem[], includeSensitive: boolean, actor: Actor, categoryNames: Map<string, string>): FlatRow[] {
    const rows: FlatRow[] = []
    for (const item of list) {
      const d = this.profiles.get(item.id, actor, { trackView: false })
      const row = flatten(d, includeSensitive)
      row.category = categoryNames.get(d.basic.categoryId) ?? ''
      rows.push(row)
    }
    return rows
  }

  async exportProfiles(opts: { ids?: string[]; filters?: import('../../shared/types').ProfileFilters; format: ExportFormat; includeSensitive: boolean; categoryNames: Map<string, string>; targetPath?: string }, actor: Actor): Promise<{ filePath: string; count: number }> {
    const s = this.settings.get()
    if (opts.includeSensitive && !s.exportSensitiveDefault) {
      // explicit user action - allowed, but audited
    }
    let list: ProfileListItem[]
    if (opts.ids?.length) {
      list = opts.ids.map((id) => {
        const d = this.profiles.get(id, actor, { trackView: false })
        return {
          id: d.id, profileCode: d.profileCode, fullName: d.basic.fullName, username: d.basic.username,
          country: d.basic.country, countryIso2: d.basic.countryIso2, city: d.basic.city, state: d.basic.state,
          phone: d.contact.primaryPhone, email: d.contact.primaryEmail, categoryId: d.basic.categoryId,
          categoryName: '', categoryColor: '', avatar: d.avatar, gender: d.basic.gender, status: d.status, dob: d.basic.dob,
          isDemo: d.isDemo, isFavorite: d.isFavorite, createdByUsername: d.audit.createdBy, createdAt: d.audit.createdAt,
          updatedByUsername: d.audit.updatedBy, updatedAt: d.audit.updatedAt, viewCount: d.audit.viewCount, lastViewedAt: d.audit.lastViewedAt,
        } as ProfileListItem
      })
    } else {
      list = this.profiles.listAllForExport({ ...opts.filters, view: opts.filters?.view ?? 'all-status' }, actor.id ?? '')
    }

    const columns = opts.includeSensitive ? [...EXPORT_COLUMNS, { header: 'Password', key: 'password' }] : EXPORT_COLUMNS
    const rows = this.exportRows(list, opts.includeSensitive, actor, opts.categoryNames)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = s.exportFolderPreset && s.exportFolderPreset !== 'vault' && s.exportFolderPreset !== 'custom' ? ensureWritableDir(presetDir(s.exportFolderPreset, this.exportsDir, this.exportsDir, 'exports')) : this.exportsDir
    const base = opts.targetPath ?? path.join(dir, `zeus-vault-export-${stamp}`)
    const wantFile = (ext: string) => (base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`)

    let filePath: string
    if (opts.format === 'csv') {
      filePath = wantFile('csv')
      fs.writeFileSync(filePath, toCsv(rows, columns), 'utf8')
    } else if (opts.format === 'json') {
      filePath = wantFile('json')
      fs.writeFileSync(filePath, JSON.stringify({ app: 'Zeus Vault', exportedAt: new Date().toISOString(), includeSensitive: opts.includeSensitive, count: rows.length, profiles: rows }, null, 2), 'utf8')
    } else if (opts.format === 'xlsx') {
      filePath = wantFile('xlsx')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Zeus Vault'
      const sheet = wb.addWorksheet('Profiles')
      sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: Math.min(42, Math.max(16, c.header.length + 6)) }))
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFF2F2F0' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15181D' } }
      for (const row of rows) sheet.addRow(row)
      sheet.views = [{ state: 'frozen', ySplit: 1 }]
      await wb.xlsx.writeFile(filePath)
    } else {
      filePath = wantFile('pdf')
      const doc = await buildSummaryPdf(rows, opts.includeSensitive)
      fs.writeFileSync(filePath, Buffer.from(doc))
    }

    this.audit.record(actor, {
      eventType: 'EXPORT_COMPLETED',
      targetType: 'system',
      detail: `Exported ${rows.length} profile(s) to ${path.basename(filePath)}${opts.includeSensitive ? ' (incl. credentials)' : ''}`,
    })
    return { filePath, count: rows.length }
  }

  async exportDossierPdf(profileId: string, includeSensitive: boolean, actor: Actor, targetPath?: string): Promise<{ filePath: string }> {
    const d = this.profiles.get(profileId, actor, { trackView: false })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const s = this.settings.get()
    const dir = s.exportFolderPreset && s.exportFolderPreset !== 'vault' && s.exportFolderPreset !== 'custom' ? ensureWritableDir(presetDir(s.exportFolderPreset, this.exportsDir, this.exportsDir, 'exports')) : this.exportsDir
    const filePath = targetPath && targetPath.toLowerCase().endsWith('.pdf')
      ? targetPath
      : path.join(dir, `dossier-${d.profileCode}-${stamp}.pdf`)
    const bytes = await buildDossierPdf(d, includeSensitive)
    fs.writeFileSync(filePath, Buffer.from(bytes))
    this.audit.record(actor, {
      eventType: 'PROFILE_EXPORTED',
      targetType: 'profile',
      targetId: d.id,
      targetLabel: d.basic.fullName,
      detail: `Dossier PDF exported${includeSensitive ? ' (incl. credentials)' : ''}`,
    })
    return { filePath }
  }

  // ---------- import ----------

  async previewImport(filePath: string): Promise<ImportPreview> {
    const ext = path.extname(filePath).toLowerCase()
    const fileName = path.basename(filePath)
    if (ext === '.csv') {
      const rows = parseCsv(fs.readFileSync(filePath, 'utf8'))
      if (!rows.length) throw new AppError('VALIDATION', 'The CSV file is empty.')
      const columns = rows[0].map((h) => h.trim())
      const data = rows.slice(1, 6).map((r) => rowToObject(columns, r))
      return { fileName, kind: 'csv', columns, rows: data, totalRows: rows.length - 1, suggestedMapping: suggestMapping(columns) }
    }
    if (ext === '.json') {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
      const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { profiles?: unknown[] }).profiles) ? (parsed as { profiles: unknown[] }).profiles : null
      if (!arr) throw new AppError('VALIDATION', 'JSON must be an array of objects or { "profiles": [...] }.')
      const objects = arr.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      const columns = [...new Set(objects.flatMap((o) => Object.keys(o)))]
      return { fileName, kind: 'json', columns, rows: objects.slice(0, 5), totalRows: objects.length, suggestedMapping: suggestMapping(columns) }
    }
    if (ext === '.xlsx' || ext === '.xlsm') {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(filePath)
      const sheet = wb.worksheets[0]
      if (!sheet) throw new AppError('VALIDATION', 'No worksheet found in the workbook.')
      const columns: string[] = []
      const data: Record<string, unknown>[] = []
      sheet.getRow(1).eachCell((cell, col) => {
        columns[col - 1] = String(cell.value ?? `Column ${col}`).trim()
      })
      for (let r = 2; r <= Math.min(sheet.rowCount, 6); r++) {
        const row = sheet.getRow(r)
        const obj: Record<string, unknown> = {}
        columns.forEach((c, i) => {
          obj[c] = cellText(row.getCell(i + 1).value)
        })
        data.push(obj)
      }
      const totalRows = Math.max(0, sheet.rowCount - 1)
      return { fileName, kind: 'xlsx', columns, rows: data, totalRows, suggestedMapping: suggestMapping(columns) }
    }
    throw new AppError('VALIDATION', 'Unsupported file type. Use CSV, JSON or XLSX.')
  }

  async executeImport(filePath: string, mapping: Record<string, string>, actor: Actor): Promise<ImportResult> {
    const preview = await this.previewImport(filePath)
    const allRows = await readAllImportRows(filePath, preview.kind)
    const result: ImportResult = { imported: 0, skipped: 0, duplicates: 0, errors: [] }
    let rowIndex = 0
    for (const raw of allRows) {
      rowIndex += 1
      const get = (field: string): string => {
        for (const [header, mapped] of Object.entries(mapping)) {
          if (mapped === field) {
            const v = raw[header]
            if (v === undefined || v === null) return ''
            return String(v).trim()
          }
        }
        return ''
      }
      const input = rowToProfileInput(get)
      if (!input.basic.fullName || input.basic.fullName.length < 2) {
        result.errors.push({ row: rowIndex + 1, message: 'Full name missing - row skipped.' })
        result.skipped += 1
        continue
      }
      const email = input.contact.primaryEmail.toLowerCase()
      const username = input.basic.username.toLowerCase()
      const dup = this.db.value<number>(
        `SELECT COUNT(*) FROM profiles p LEFT JOIN profile_contacts pc ON pc.profile_id = p.id
         WHERE p.deleted_at IS NULL AND ((? <> '' AND lower(pc.primary_email) = ?) OR (? <> '' AND lower(p.username) = ?))`,
        [email, email, username, username],
      )
      if (dup) {
        result.duplicates += 1
        continue
      }
      try {
        this.profiles.create(input, { id: actor.id, username: actor.username })
        result.imported += 1
      } catch (e) {
        result.errors.push({ row: rowIndex + 1, message: e instanceof Error ? e.message : 'Unknown error' })
        result.skipped += 1
      }
    }
    this.audit.record(actor, {
      eventType: 'IMPORT_COMPLETED',
      targetType: 'system',
      detail: `Imported ${result.imported} profile(s) from ${preview.fileName} (${result.duplicates} duplicates, ${result.skipped} skipped)`,
    })
    return result
  }
}

function rowToObject(columns: string[], values: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  columns.forEach((c, i) => {
    obj[c] = values[i] ?? ''
  })
  return obj
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text ?? '')
  if (typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result ?? '')
  if (typeof v === 'object' && 'richText' in v) return ((v as { richText: { text: string }[] }).richText ?? []).map((t) => t.text).join('')
  return String(v)
}

async function readAllImportRows(filePath: string, kind: 'csv' | 'json' | 'xlsx'): Promise<Record<string, unknown>[]> {
  if (kind === 'csv') {
    const rows = parseCsv(fs.readFileSync(filePath, 'utf8'))
    if (!rows.length) return []
    const columns = rows[0].map((h) => h.trim())
    return rows.slice(1).map((r) => rowToObject(columns, r))
  }
  if (kind === 'json') {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    const arr = Array.isArray(parsed) ? parsed : (parsed as { profiles?: unknown[] }).profiles ?? []
    return arr.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheet = wb.worksheets[0]
  const columns: string[] = []
  sheet.getRow(1).eachCell((cell, col) => {
    columns[col - 1] = String(cell.value ?? `Column ${col}`).trim()
  })
  const out: Record<string, unknown>[] = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const obj: Record<string, unknown> = {}
    let empty = true
    columns.forEach((c, i) => {
      const v = cellText(row.getCell(i + 1).value)
      if (v) empty = false
      obj[c] = v
    })
    if (!empty) out.push(obj)
  }
  return out
}

function rowToProfileInput(get: (field: string) => string): ProfileInput {
  const g = (f: string) => get(f)
  const fullAddressValue = g('fullAddress')
  return {
    basic: {
      fullName: g('fullName'), username: g('username'), dob: normalizeDob(g('dob')), gender: g('gender'),
      nationality: g('nationality'), country: g('country'), countryIso2: g('countryIso2').toUpperCase(),
      state: g('state'), city: g('city'), preferredLanguage: g('preferredLanguage'), timezone: g('timezone'),
      profileStatus: 'Active', categoryId: null, tags: splitTags(g('tags')), notes: g('notes'),
    },
    contact: {
      primaryPhone: g('primaryPhone'), secondaryPhone: g('secondaryPhone'), phoneCountryCode: '',
      primaryEmail: g('primaryEmail'), secondaryEmail: g('secondaryEmail'), altEmail: '', website: g('website'),
      contactPreference: '', socialLinks: [],
    },
    address: {
      street: g('street'), apartment: g('apartment'), city: g('addressCity') || g('city'), state: g('addressState') || g('state'),
      postalCode: g('postalCode'), country: g('addressCountry') || g('country'), countryCode: '',
    },
    account: {
      loginUsername: g('loginUsername'), loginEmail: g('loginEmail'), password: '', clearPassword: false,
      accountProvider: g('accountProvider'), accountCreatedAt: '', lastLogin: '', status: g('accountStatus') || 'Active',
      recoveryInfo: '', notes: fullAddressValue ? `Imported with full address: ${fullAddressValue}` : '',
    },
    professional: {
      occupation: g('occupation'), jobTitle: g('jobTitle'), company: g('company'), industry: g('industry'),
      website: '', workEmail: '', workPhone: '', notes: '',
    },
    custom: { fields: [], personalNotes: '', internalNotes: 'Imported via Zeus Vault import wizard.', personalTags: [] },
  }
}

function splitTags(v: string): string[] {
  return v.split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 30)
}

function normalizeDob(v: string): string {
  const t = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

async function buildSummaryPdf(rows: FlatRow[], includeSensitive: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([841.89, 595.28]) // A4 landscape
  const margin = 36
  let y = 595.28 - margin
  page.drawText('ZEUS VAULT - PROFILE EXPORT', { x: margin, y, size: 16, font: bold, color: rgb(0.9, 0.29, 0.39) })
  y -= 18
  page.drawText(`${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC · ${rows.length} record(s)${includeSensitive ? ' · INCLUDES CREDENTIALS' : ''} · DEMONSTRATION DATA IS FICTIONAL`, {
    x: margin, y, size: 8, font, color: rgb(0.52, 0.54, 0.57),
  })
  y -= 22
  const cols = ['Full Name', 'Username', 'Country', 'City', 'Email', 'Phone']
  page.drawText(cols.join('  |  '), { x: margin, y, size: 8.5, font: bold, color: rgb(0.95, 0.95, 0.94) })
  y -= 14
  for (const row of rows) {
    if (y < margin + 20) {
      page = doc.addPage([841.89, 595.28])
      y = 595.28 - margin
    }
    const line = [row.fullName, row.username, row.countryIso2, row.city, row.primaryEmail, row.primaryPhone]
      .map((v) => String(v ?? '').slice(0, 40))
      .join('  |  ')
    page.drawText(line, { x: margin, y, size: 8, font, color: rgb(0.85, 0.85, 0.84) })
    y -= 12
  }
  return doc.save()
}

async function buildDossierPdf(d: ProfileDetail, includeSensitive: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const pageWidth = 595.28
  const pageHeight = 841.89
  const margin = 48
  let page = doc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  const section = (title: string) => {
    if (y < margin + 80) {
      page = doc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
    y -= 10
    page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: pageWidth - margin, y: y + 4 }, thickness: 0.7, color: rgb(0.55, 0.16, 0.23) })
    page.drawText(title.toUpperCase(), { x: margin, y: y - 11, size: 9.5, font: bold, color: rgb(0.55, 0.16, 0.23) })
    y -= 24
  }
  const field = (label: string, value: string) => {
    if (y < margin + 30) {
      page = doc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
    page.drawText(label.toUpperCase(), { x: margin, y, size: 6.3, font: bold, color: rgb(0.33, 0.36, 0.38) })
    page.drawText(String(value || ' - ').slice(0, 95), { x: margin, y: y - 11, size: 9, font, color: rgb(0.1, 0.11, 0.13) })
    y -= 26
  }

  // Header band
  page.drawRectangle({ x: 0, y: pageHeight - 92, width: pageWidth, height: 92, color: rgb(0.06, 0.07, 0.08) })
  page.drawText('ZEUS VAULT', { x: margin, y: pageHeight - 44, size: 17, font: bold, color: rgb(0.89, 0.29, 0.39) })
  page.drawText('PROFILE DOSSIER', { x: margin, y: pageHeight - 60, size: 8, font, color: rgb(0.52, 0.54, 0.57) })
  page.drawText(d.isDemo ? 'FICTIONAL DEMONSTRATION RECORD' : 'CONFIDENTIAL', { x: pageWidth - margin - 200, y: pageHeight - 44, size: 9, font: bold, color: rgb(0.84, 0.61, 0.27) })
  y = pageHeight - 120

  page.drawText(d.basic.fullName, { x: margin, y, size: 22, font: bold, color: rgb(0.95, 0.95, 0.94) })
  page.drawText(`${d.profileCode}   ·   ${d.basic.country}   ·   ${d.status.toUpperCase()}`, { x: margin, y: y - 16, size: 9, font: mono, color: rgb(0.6, 0.62, 0.65) })
  y -= 40

  section('Personal Information')
  field('Full Name', d.basic.fullName)
  field('Username', d.basic.username)
  field('Date of Birth', d.basic.dob)
  field('Gender', d.basic.gender)
  field('Nationality', d.basic.nationality)
  field('Country / City', [d.basic.country, d.basic.city, d.basic.state].filter(Boolean).join(', '))

  section('Contact Information')
  field('Primary Phone', d.contact.primaryPhone)
  field('Secondary Phone', d.contact.secondaryPhone)
  field('Primary Email', d.contact.primaryEmail)
  field('Secondary Email', d.contact.secondaryEmail)
  field('Website', d.contact.website)

  section('Address')
  field('Street', d.address.street)
  field('City / State', [d.address.city, d.address.state].filter(Boolean).join(', '))
  field('Postal Code', d.address.postalCode)
  field('Full Address', fullAddress(d))

  section('Account Information')
  field('Login Username', d.account.loginUsername)
  field('Login Email', d.account.loginEmail)
  if (includeSensitive && d.account.password) field('Account Password', d.account.password)
  field('Account Provider', d.account.accountProvider)
  field('Account Status', d.account.status)

  section('Professional')
  field('Occupation', d.professional.occupation)
  field('Job Title', d.professional.jobTitle)
  field('Company', d.professional.company)
  field('Industry', d.professional.industry)

  section('Audit')
  field('Created By', `${d.audit.createdBy} @ ${d.audit.createdAt}`)
  field('Last Updated By', `${d.audit.updatedBy ?? ' - '} @ ${d.audit.updatedAt}`)
  field('Export Generated', `${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`)

  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawText(`ZEUS VAULT · DOSSIER ${d.profileCode} · PAGE ${i + 1}/${pages.length}`, {
      x: margin, y: 22, size: 6.5, font: mono, color: rgb(0.35, 0.37, 0.4),
    })
  })
  return doc.save()
}
