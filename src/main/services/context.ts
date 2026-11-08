import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { safeStorage } from 'electron'
import { APP_VERSION } from '../../shared/constants'
import { resolveVaultPaths, Vault, type VaultPaths } from './vault'
import { SettingsService } from './settings'
import { AuditService } from './audit'
import { AuthService } from './auth'
import { ProfilesService } from './profiles'
import { DashboardService } from './dashboard'
import { UsersService } from './users'
import { CategoriesService } from './categories'
import { SearchService } from './search'
import { PhotosService } from './photos'
import { DocsService } from './docs'
import { NlpService } from './nlp'
import { TransferService } from './transfer'
import { BackupService } from './backup'
import { SecurityService } from './security'
import { B2bService } from './b2b'
import { FileSecretStore, type SecretStore } from './secrets'
import { McpLayer } from '../mcp/server'
import { ApiKeysService } from './apikeys'
import { encryptField, decryptField } from '../lib/crypto'
import { seedDemoProfiles, seedB2bContacts } from './seed'
import { hashPassword } from '../lib/crypto'
import { AppError } from '../lib/errors'
import type { SetupInput } from '../../shared/types'
import { randomHex, sha256Hex } from '../lib/crypto'
export interface VaultContext {
  rootDir: string
  paths: VaultPaths
  vault: Vault | null
  settings: SettingsService | null
  audit: AuditService | null
  auth: AuthService | null
  profiles: ProfilesService | null
  dashboard: DashboardService | null
  users: UsersService | null
  categories: CategoriesService | null
  search: SearchService | null
  photos: PhotosService | null
  docs: DocsService | null
  nlp: NlpService | null
  transfer: TransferService | null
  backup: BackupService | null
  b2b: B2bService | null
  apikeys: ApiKeysService | null
  mcp: McpLayer
  security: SecurityService | null
}
const WRAP_FILE = 'vault.wrap'
export class AppContext {
  readonly rootDir: string
  readonly paths: VaultPaths
  readonly secrets: FileSecretStore
  vault: Vault | null = null
  settings: SettingsService | null = null
  audit: AuditService | null = null
  auth: AuthService | null = null
  profiles: ProfilesService | null = null
  dashboard: DashboardService | null = null
  users: UsersService | null = null
  categories: CategoriesService | null = null
  search: SearchService | null = null
  photos: PhotosService | null = null
  docs: DocsService | null = null
  nlp: NlpService | null = null
  transfer: TransferService | null = null
  backup: BackupService | null = null
  b2b: B2bService | null = null
  apikeys: ApiKeysService | null = null
  mcp: McpLayer | null = null
  security: SecurityService | null = null
  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.paths = resolveVaultPaths(rootDir)
    this.secrets = new FileSecretStore(path.join(rootDir, 'zv-secrets.json'))
  }
  private wrapPath(): string {
    return path.join(this.rootDir, WRAP_FILE)
  }
  encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }
  isInitialized(): boolean {
    return fs.existsSync(this.wrapPath()) && Vault.isInitialized(this.paths)
  }
  private readWrapKey(): Buffer {
    const raw = fs.readFileSync(this.wrapPath(), 'utf8').trim()
    if (raw.startsWith('plain:')) {
      return Buffer.from(raw.slice('plain:'.length), 'hex')
    }
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(raw, 'base64'))
      return Buffer.from(decrypted, 'hex')
    } catch {
      throw new AppError(
        'MASTER_KEY_UNRECOVERABLE',
        'The vault key could not be unwrapped by the operating system keychain. The vault cannot be opened on this device. Restore from a backup instead.',
      )
    }
  }
  private writeWrapKey(key: Buffer): void {
    if (this.encryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key.toString('hex'))
      fs.writeFileSync(this.wrapPath(), encrypted.toString('base64'), { mode: 0o600 })
    } else {
      fs.writeFileSync(this.wrapPath(), `plain:${key.toString('hex')}`, { mode: 0o600 })
    }
  }
  private bindServices(vault: Vault): void {
    this.vault = vault
    const db = vault.db
    this.settings = new SettingsService(db)
    this.audit = new AuditService(db)
    const fieldKey = vault.fieldKey
    const sealed: SecretStore = {
      get: (k) => {
        const raw = this.secrets.get(k)
        if (!raw) return null
        try {
          return decryptField(raw, fieldKey)
        } catch {
          return null
        }
      },
      set: (k, v) => this.secrets.set(k, encryptField(v, fieldKey, 'secrets')),
      delete: (k) => this.secrets.delete(k),
    }
    this.auth = new AuthService(db, this.audit, this.settings, sealed)
    this.profiles = new ProfilesService(db, this.audit, this.settings, vault.fieldKey)
    this.dashboard = new DashboardService(db)
    this.users = new UsersService(db, this.audit, this.settings, this.auth)
    this.categories = new CategoriesService(db, this.audit)
    this.search = new SearchService(db, this.profiles)
    this.photos = new PhotosService(db)
    this.docs = new DocsService(db)
    this.nlp = new NlpService(db)
    this.profiles!.photoHook = (profileId, imageId, kind) => this.photos!.enqueue(profileId, imageId, kind)
    this.profiles!.photoRemovedHook = (profileId, imageId, kind) => this.photos!.removeToken(profileId, imageId, kind)
    this.profiles!.ocrHook = (attachmentId, profileId) => this.docs!.enqueue(attachmentId, profileId)
    // Backfill existing vaults so search works without manual steps.
    setImmediate(() => {
      try {
        if (db.value<number>('SELECT COUNT(*) FROM photo_tokens WHERE status = ? AND phash IS NOT NULL', ['done']) === 0) {
          this.photos!.enqueueAllProfiles()
        }
        if ((db.value<number>('SELECT COUNT(*) FROM text_embeddings') ?? 0) === 0) {
          this.nlp!.embedAll()
        }
      } catch {
        /* backfill is best-effort */
      }
    })
    this.transfer = new TransferService(db, this.profiles, this.audit, this.settings, vault.fieldKey, this.paths.exportsDir)
    this.backup = new BackupService(db, this.audit, this.settings, this.paths.backupsDir, () => vault.createEncryptedSnapshot())
    this.b2b = new B2bService(db, this.audit, this.paths.exportsDir)
    this.apikeys = new ApiKeysService(db, this.audit)
    this.mcp = new McpLayer(this)
    this.security = new SecurityService(db, vault.fieldKey)
  }
  /** Opens the vault if initialized. Returns true when services are ready. */
  open(): boolean {
    if (this.vault) return true
    if (!this.isInitialized()) return false
    Vault.ensureDirs(this.paths)
    const wrapKey = this.readWrapKey()
    const vault = Vault.open(this.paths, wrapKey)
    this.bindServices(vault)
    return true
  }
  /** First-run setup: creates the encrypted vault, admin account, categories and optional demo data. */
  initialize(input: SetupInput): void {
    if (this.isInitialized()) throw new AppError('VALIDATION', 'The vault is already initialized.')
    validateSetup(input)
    const wrapKey = randomHex(32)
    this.writeWrapKey(Buffer.from(wrapKey, 'hex'))
    const vault = Vault.initialize(this.paths, Buffer.from(wrapKey, 'hex'))
    this.bindServices(vault)
    const db = vault.db
    this.settings!.setRaw('vault.os_keychain', String(this.encryptionAvailable()))
    this.settings!.setRaw('vault.app_version', APP_VERSION)
    this.categories!.seedDefaults('system')
    const adminId = crypto.randomUUID()
    const now = new Date().toISOString()
    const hashed = hashPassword(input.password)
    db.run(
      `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
       VALUES (?,?,?,?,?,?,?,'admin','active',?,?,?,'{}')`,
      [adminId, input.adminUsername.trim(), input.adminUsername.trim().toLowerCase(), input.adminFullName.trim(), input.adminEmail.trim(), input.adminEmail.trim().toLowerCase(), hashed, now, now, adminId],
    )
    this.audit!.record({ id: adminId, username: input.adminUsername.trim() }, {
      eventType: 'USER_CREATED',
      targetType: 'user',
      targetId: adminId,
      targetLabel: input.adminUsername.trim(),
      detail: 'Initial administrator account created during first-run setup',
    })
    if (input.seedDemoData) {
      const cats = this.categories!.list()
      const seeded = seedDemoProfiles(db, this.profiles!, cats, { id: adminId, username: input.adminUsername.trim() })
      const b2bSeeded = seedB2bContacts(db, this.b2b!, { id: adminId, username: input.adminUsername.trim() })
      this.settings!.setRaw('vault.demo_seeded', seeded > 0 ? 'true' : 'false', input.adminUsername.trim())
      this.audit!.record({ id: adminId, username: input.adminUsername.trim() }, {
        eventType: 'IMPORT_COMPLETED',
        targetType: 'system',
        detail: `Seeded ${seeded} fictional demonstration profile(s) and ${b2bSeeded} B2B contact(s)`,
      })
    }
  }
  deviceName(): string {
    return `${os.hostname()} · ${process.platform}`
  }
  requireReady(): Required<Omit<AppContext, 'rootDir' | 'paths' | 'open' | 'initialize' | 'isInitialized' | 'encryptionAvailable' | 'deviceName'>> {
    if (!this.vault) {
      if (!this.open()) throw new AppError('NOT_INITIALIZED', 'The vault has not been set up yet.')
    }
    return this as never
  }
  close(): void {
    try {
      this.vault?.close()
    } catch {
      /* ignore */
    }
    this.vault = null
  }
}
function validateSetup(input: SetupInput): null {
  const fields: { field: string; message: string }[] = []
  if (!input.adminFullName?.trim() || input.adminFullName.trim().length < 2) fields.push({ field: 'adminFullName', message: 'Enter your full name.' })
  if (!/^[a-z0-9._-]{3,40}$/i.test(input.adminUsername?.trim() ?? '')) fields.push({ field: 'adminUsername', message: 'Username: 3-40 chars, letters, digits, dot, underscore, hyphen.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.adminEmail?.trim() ?? '')) fields.push({ field: 'adminEmail', message: 'Enter a valid email address.' })
  const pw = input.password ?? ''
  if (pw.length < 12) fields.push({ field: 'password', message: 'Password must be at least 12 characters.' })
  if (!/[A-Z]/.test(pw)) fields.push({ field: 'password', message: 'Password must contain an uppercase letter.' })
  if (!/[0-9]/.test(pw)) fields.push({ field: 'password', message: 'Password must contain a number.' })
  if (!/[^A-Za-z0-9]/.test(pw)) fields.push({ field: 'password', message: 'Password must contain a symbol.' })
  if (fields.length) throw new AppError('VALIDATION', 'Please correct the highlighted fields.', fields)
  return null
}
export function hashLookupKey(...parts: string[]): string {
  return sha256Hex(parts.join('|'))
}
