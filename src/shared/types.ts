export type Role = 'admin' | 'standard' | 'readonly'
export type UserStatus = 'active' | 'suspended' | 'locked'
export type ProfileStatus = 'active' | 'archived'
export type FieldTag = 'certain' | 'inferred' | 'uncertain'

export interface SessionUser {
  id: string
  username: string
  fullName: string
  email: string
  role: Role
  avatar: string | null
  status: UserStatus
}

export interface UserRecord extends SessionUser {
  createdAt: string
  lastLogin: string | null
  lastActivity: string | null
  mustChangePassword: boolean
  sessionActive: boolean
  profileCount: number
}

export interface UserSessionInfo {
  id: string
  sessionRef: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  revokedAt: string | null
  revokedReason: string | null
  deviceName: string
  ip: string
  authMethod: string
  current: boolean
}

export interface LoginHistoryEntry {
  id: string
  eventType: string
  createdAt: string
  deviceName: string | null
  sessionRef: string | null
  detail: string | null
  actorUsername: string
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  dataDir: string
  dbPath: string
  storageReady: boolean
  osKeychain: boolean
  encryptionActive: boolean
  integrityOk: boolean
  fingerprints: { field: number; db: number }
  encryptedFields: number
  demoSeeded: boolean
  dbBytes: number
}

export type SessionState =
  | { state: 'bootstrapped' }
  | { state: 'unauthenticated' }
  | { state: 'locked'; user: SessionUser }
  | {
      state: 'authenticated'
      user: SessionUser
      session: { id: string; expiresAt: string; deviceName: string; createdAt: string; sessionRef: string }
      app: AppInfo
      setupRequired: boolean
    }

export interface FieldError {
  field: string
  message: string
}

export interface ApiResult<T> {
  ok: boolean
  result?: T
  error?: { code: string; message: string; fields?: FieldError[] }
}

export interface ActivityItem {
  id: string
  eventType: string
  actorUsername: string
  targetId: string | null
  summary: string
  createdAt: string
}

export interface DashboardData {
  stats: {
    totalProfiles: number
    activeProfiles: number
    archivedProfiles: number
    totalCountries: number
    recentlyCreated: number
    recentlyUpdated: number
    totalUsers: number
    activeSessions: number
  }
  recentProfiles: ProfileListItem[]
  recentlyCreated: ProfileListItem[]
  recentlyModified: ProfileListItem[]
  recentlyViewed: ProfileListItem[]
  mostViewed: ProfileListItem[]
  countryDistribution: { country: string; iso2: string; count: number }[]
  categoryDistribution: { category: string; color: string; count: number }[]
  latestActivity: ActivityItem[]
  totalProfilesDelta: number
}

export interface CategoryRecord {
  id: string
  name: string
  description: string
  color: string
  icon: string
  profileCount: number
  createdBy: string | null
  createdAt: string
  updatedBy: string | null
  updatedAt: string
  isDefault: boolean
}

export interface TagRecord {
  id: string
  name: string
  color: string
  profileCount: number
}

export interface ProfileListItem {
  id: string
  profileCode: string
  fullName: string
  username: string
  country: string
  countryIso2: string
  city: string
  state: string
  phone: string
  email: string
  categoryId: string
  categoryName: string
  categoryColor: string
  avatar: string | null
  gender: string
  status: ProfileStatus
  dob: string
  isDemo: boolean
  isFavorite: boolean
  createdByUsername: string
  createdAt: string
  updatedByUsername: string | null
  updatedAt: string
  viewCount: number
  lastViewedAt: string | null
}

export interface CustomField {
  id?: string
  label: string
  value: string
  type: 'text' | 'number' | 'date' | 'url' | 'secret'
}

export interface SocialLink {
  id?: string
  label: string
  url: string
}

export interface CustomFieldMeta {
  key: string
  label: string
  updatedAt: string
  updatedBy: string
}

export interface ProfileDetail {
  id: string
  profileCode: string
  status: ProfileStatus
  isDemo: boolean
  isFavorite: boolean
  avatar: string | null
  images: { id: string; kind: string; name: string; mime: string; size: number; dataUrl: string; createdAt: string }[]
  tags: TagRecord[]

  basic: {
    fullName: string
    username: string
    dob: string
    gender: string
    nationality: string
    country: string
    countryIso2: string
    state: string
    city: string
    preferredLanguage: string
    timezone: string
    categoryId: string
    categoryName: string
    profileStatus: string
    notes: string
  }
  contact: {
    primaryPhone: string
    secondaryPhone: string
    phoneCountryCode: string
    primaryEmail: string
    secondaryEmail: string
    altEmail: string
    website: string
    contactPreference: string
    socialLinks: SocialLink[]
  }
  address: {
    street: string
    apartment: string
    city: string
    state: string
    postalCode: string
    country: string
    countryCode: string
  }
  account: {
    loginUsername: string
    loginEmail: string
    password: string
    accountProvider: string
    passwordUpdatedAt: string | null
    hasPassword: boolean
    accountCreatedAt: string
    lastLogin: string
    status: string
    recoveryInfo: string
    notes: string
  }
  professional: {
    occupation: string
    jobTitle: string
    company: string
    industry: string
    website: string
    workEmail: string
    workPhone: string
    notes: string
  }
  custom: {
    fields: CustomField[]
    personalNotes: string
    internalNotes: string
    personalTags: string[]
    fieldMeta: CustomFieldMeta[]
  }
  attachments: AttachmentRecord[]

  audit: {
    createdBy: string
    createdById: string | null
    createdAt: string
    updatedBy: string | null
    updatedById: string | null
    updatedAt: string
    archivedBy: string | null
    archivedAt: string | null
    deletedBy: string | null
    deletedAt: string | null
    deleted: boolean
    viewCount: number
    lastViewedAt: string | null
    lastViewedBy: string | null
    version: number
  }
}

export interface AttachmentRecord {
  id: string
  profileId: string
  kind: 'attachment' | 'image'
  category: string
  name: string
  mime: string
  size: number
  dataUrl: string
  createdAt: string
  uploadedBy: string
}

export interface FieldHistoryEntry {
  id: string
  field: string
  fieldLabel: string
  oldValue: string | null
  newValue: string | null
  action: string
  actorUsername: string
  createdAt: string
}

export interface AuditEntry {
  id: string
  eventType: string
  actorId: string | null
  actorUsername: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  field: string | null
  oldValue: string | null
  newValue: string | null
  detail: string | null
  sessionRef: string | null
  deviceName: string | null
  createdAt: string
}

export interface Paginated<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export interface ProfileFilters {
  view?: 'active' | 'archived' | 'favorites' | 'all-status'
  search?: string
  nlpQuery?: string
  country?: string
  categoryId?: string
  createdBy?: string
  statusList?: string
  gender?: string
  tags?: string[]
  createdFrom?: string
  createdTo?: string
  updatedFrom?: string
  updatedTo?: string
  missing?: string[]
  industry?: string
  emailDomain?: string
  categoryName?: string
  location?: string
  company?: string
  limit?: number
  sort?: { key: string; dir: 'asc' | 'desc' }
  page?: number
  pageSize?: number
}

export interface SavedSearch {
  id: string
  name: string
  kind: 'search' | 'nlp'
  query: string
  filters: string | null
  createdAt: string
}

export type ThemeName = 'dark' | 'graphite' | 'light'

export interface AppSettings {
  appName: string
  theme: ThemeName
  language: string
  dateFormat: string
  timezone: string
  defaultCountry: string
  sessionDurationDays: number
  singleSession: boolean
  inactivityLockMinutes: number
  requirePasswordUnlock: boolean
  passwordMinLength: number
  requireUpper: boolean
  requireNumber: boolean
  requireSymbol: boolean
  passwordHistory: number
  loginMaxAttempts: number
  loginLockMinutes: number
  trackViews: boolean
  clipboardClearSeconds: number
  animationIntensity: 'full' | 'reduced' | 'off'
  motionPreference: 'system' | 'custom'
  tableDensity: 'compact' | 'comfortable'
  fontScale: number
  previewBehavior: 'proximity' | 'hover' | 'off'
  backgroundTexture: boolean
  watermarkDemos: boolean
  exportSensitiveDefault: boolean
  backupRetention: number
  mcpEnabled: boolean
  mcpPort: number
  exportFolderPreset: FolderPreset
  backupFolderPreset: FolderPreset
}

export type FolderPreset = 'vault' | 'documents' | 'desktop' | 'downloads' | 'custom'

export interface PhotoQueueStatus {
  queued: number
  processing: number
  done: number
  failed: number
  current: string | null
  lastError: string | null
}

export interface PhotoMatch {
  tokenId: string
  profileId: string
  kind: 'avatar' | 'gallery'
  score: number
  phashSim: number
  histSim: number
  faceSim: number | null
  faceDetected: boolean
}

export interface NlpAlias {
  alias: string
  canonical: string
}

export type SettingsSection = 'general' | 'security' | 'appearance'

export interface UpdateProfileResult {
  id: string
  changes: number
}

export interface IntegrityResult {
  ok: boolean
  quickCheck: string
  foreignKeyErrors: number
  orphanRows: number
  encryptedFields: number
  encryptedFailures: number
  duplicateCodes: number
  checkedAt: string
}

// ---- Composed profile payloads (create/update) ----

export interface ProfileInputBasic {
  fullName: string
  username: string
  dob: string
  gender: string
  nationality: string
  country: string
  countryIso2: string
  state: string
  city: string
  preferredLanguage: string
  timezone: string
  profileStatus: string
  categoryId: string | null
  tags: string[]
  notes: string
}

export interface ProfileInputContact {
  primaryPhone: string
  secondaryPhone: string
  phoneCountryCode: string
  primaryEmail: string
  secondaryEmail: string
  altEmail: string
  website: string
  contactPreference: string
  socialLinks: SocialLink[]
}

export interface ProfileInputAddress {
  street: string
  apartment: string
  city: string
  state: string
  postalCode: string
  country: string
  countryCode: string
}

export interface ProfileInputAccount {
  loginUsername: string
  loginEmail: string
  password: string
  clearPassword: boolean
  accountProvider: string
  accountCreatedAt: string
  lastLogin: string
  status: string
  recoveryInfo: string
  notes: string
}

export interface ProfileInputProfessional {
  occupation: string
  jobTitle: string
  company: string
  industry: string
  website: string
  workEmail: string
  workPhone: string
  notes: string
}

export interface ProfileInputCustom {
  fields: CustomField[]
  personalNotes: string
  internalNotes: string
  personalTags: string[]
}

export interface ProfileInput {
  basic: ProfileInputBasic
  contact: ProfileInputContact
  address: ProfileInputAddress
  account: ProfileInputAccount
  professional: ProfileInputProfessional
  custom: ProfileInputCustom
}

export interface ProfileQuery extends ProfileFilters {
  page?: number
  pageSize?: number
}

export interface SearchQuery {
  text: string
  page?: number
  pageSize?: number
}

export interface SearchClause {
  field: string
  label: string
  value: string
  confidence: 'certain' | 'inferred' | 'uncertain'
}

export interface SearchInterpretation {
  freeText: string
  clauses: SearchClause[]
  filters: ProfileFilters
  nlp: boolean
}

export interface SearchResults {
  interpretation: SearchInterpretation
  rows: ProfileListItem[]
  total: number
  page: number
  pageSize: number
  tookMs: number
}

export interface ExtractedField {
  key: string
  label: string
  value: string
  confidence: 'certain' | 'inferred' | 'uncertain'
  category: 'Identity' | 'Address' | 'Contact' | 'Professional' | 'Account' | 'Meta' | 'Tags' | 'Notes'
}

export interface NlpExtractResult {
  fields: ExtractedField[]
  values: Record<string, string>
  warnings: string[]
}

export interface ImportPreview {
  fileName: string
  kind: 'csv' | 'json' | 'xlsx'
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows: number
  suggestedMapping: Record<string, string>
}

export interface ImportResult {
  imported: number
  skipped: number
  duplicates: number
  errors: { row: number; message: string }[]
}

export interface CountryStat {
  name: string
  iso2: string
  dial: string
  region: string
  profileCount: number
  favourites: number
  lastUpdated: string | null
}

export interface BackupEntry {
  id: string
  label: string
  mode: 'plain' | 'encrypted'
  path: string
  size: number
  createdAt: string
  createdBy: string
  status: string
}

export interface ApiKeyListItem {
  id: string
  label: string
  hint: string
  createdAt: string
  lastUsedAt: string | null
  ownerUsername: string
}

export interface GeneratedApiKey {
  id: string
  key: string
  hint: string
  label: string
  createdAt: string
}

export interface SecurityCenterData {
  encryptionActive: boolean
  fieldFingerprint: number
  dbFingerprint: number
  protection: 'system' | 'password'
  auditChainOk: boolean
  auditEntries: number
  integrity: IntegrityResult | null
  sessions: UserSessionInfo[]
  loginHistory: LoginHistoryEntry[]
  backupCount: number
}

export interface SetupStatus {
  initialized: boolean
  hasUsers: boolean
  encryptionAvailable: boolean
  osKeychain: boolean
}

export interface SetupInput {
  adminFullName: string
  adminUsername: string
  adminEmail: string
  password: string
  seedDemoData: boolean
}

export type B2bStatus = 'Lead' | 'Active' | 'Dormant'

export interface B2bContact {
  id: string
  b2bCode: string
  companyName: string
  industry: string
  website: string
  workType: string
  contactPerson: string
  contactRole: string
  phone: string
  email: string
  street: string
  city: string
  state: string
  postalCode: string
  country: string
  countryIso2: string
  status: B2bStatus
  notes: string
  tags: string[]
  isFavorite: boolean
  isDemo: boolean
  createdByUsername: string
  createdAt: string
  updatedByUsername: string | null
  updatedAt: string
}

export interface B2bInput {
  companyName: string
  industry: string
  website: string
  workType: string
  contactPerson: string
  contactRole: string
  phone: string
  email: string
  street: string
  city: string
  state: string
  postalCode: string
  country: string
  countryIso2: string
  status: B2bStatus
  notes: string
  tags: string[]
}

export interface B2bListQuery {
  search?: string
  industry?: string
  status?: B2bStatus | 'all'
  country?: string
  favoritesOnly?: boolean
  sort?: { key: string; dir: 'asc' | 'desc' }
  page?: number
  pageSize?: number
}

export interface B2bIndustries {
  names: string[]
}

export interface ExportResult {
  ok: boolean
  filePath?: string
  count?: number
  message?: string
}
