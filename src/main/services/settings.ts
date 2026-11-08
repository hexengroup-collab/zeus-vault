import { DEFAULT_SETTINGS } from '../../shared/constants'
import type { AppSettings } from '../../shared/types'
import type { Db } from '../db/sqlite'

const PREFIX = 'setting.'

const NUMERIC: (keyof AppSettings)[] = [
  'sessionDurationDays',
  'inactivityLockMinutes',
  'passwordMinLength',
  'passwordHistory',
  'loginMaxAttempts',
  'loginLockMinutes',
  'clipboardClearSeconds',
  'fontScale',
  'backupRetention',
  'mcpPort',
]
const BOOLEAN: (keyof AppSettings)[] = [
  'singleSession',
  'requirePasswordUnlock',
  'requireUpper',
  'requireNumber',
  'requireSymbol',
  'trackViews',
  'backgroundTexture',
  'watermarkDemos',
  'exportSensitiveDefault',
  'mcpEnabled',
]
const ENUMS: Partial<Record<keyof AppSettings, string[]>> = {
  theme: ['dark', 'graphite', 'light'],
  dateFormat: ['utc', 'military', 'iso', 'readable', 'relative'],
  animationIntensity: ['full', 'reduced', 'off'],
  motionPreference: ['system', 'custom'],
  tableDensity: ['compact', 'comfortable'],
  previewBehavior: ['proximity', 'hover', 'off'],
  exportFolderPreset: ['vault', 'documents', 'desktop', 'downloads', 'custom'],
  backupFolderPreset: ['vault', 'documents', 'desktop', 'downloads', 'custom'],
}
const TEXT: (keyof AppSettings)[] = [
  'appName',
  'language',
  'timezone',
  'defaultCountry',
]

export class SettingsService {
  constructor(private db: Db) {}

  get(): AppSettings {
    const rows = this.db.all<{ key: string; value: string }>(`SELECT key, value FROM application_settings WHERE key LIKE 'setting.%'`)
    const result: AppSettings = { ...DEFAULT_SETTINGS }
    const raw: Record<string, unknown> = {}
    for (const r of rows) {
      const k = r.key.slice(PREFIX.length) as keyof AppSettings
      if (!(k in DEFAULT_SETTINGS)) continue
      try {
        raw[k] = JSON.parse(r.value)
      } catch {
        raw[k] = r.value
      }
    }
    for (const k of NUMERIC) {
      const v = Number(raw[k])
      if (Number.isFinite(v)) result[k] = v as never
    }
    for (const k of BOOLEAN) {
      if (typeof raw[k] === 'boolean') result[k] = raw[k] as never
    }
    for (const k of TEXT) {
      if (typeof raw[k] === 'string' && raw[k]) result[k] = raw[k] as never
    }
    for (const [k, allowed] of Object.entries(ENUMS)) {
      if (typeof raw[k] === 'string' && allowed!.includes(raw[k] as string)) result[k as keyof AppSettings] = raw[k] as never
    }
    result.sessionDurationDays = Math.min(365, Math.max(1, result.sessionDurationDays))
    result.inactivityLockMinutes = Math.min(240, Math.max(1, result.inactivityLockMinutes))
    result.passwordMinLength = Math.min(64, Math.max(8, result.passwordMinLength))
    result.clipboardClearSeconds = Math.min(600, Math.max(0, result.clipboardClearSeconds))
    result.mcpPort = Math.min(65535, Math.max(1024, Math.floor(result.mcpPort) || 7421))
    result.fontScale = Math.min(1.3, Math.max(0.85, result.fontScale))
    return result
  }

  update(patch: Partial<AppSettings>, actor: string): AppSettings {
    const allowedKeys = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]
    const now = new Date().toISOString()
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (!allowedKeys.includes(k as keyof AppSettings) || v === undefined) continue
        this.db.run(
          `INSERT INTO application_settings(key, value, updated_at, updated_by) VALUES (?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [`${PREFIX}${k}`, JSON.stringify(v), now, actor],
        )
      }
    })
    return this.get()
  }

  /** Administrative credential used to wrap the database master key (never the same as the login hash). */
  getAdminCredentialStored(): string | null {
    return this.db.value<string>(`SELECT value FROM application_settings WHERE key = 'vault.admin_credential'`) ?? null
  }

  setAdminCredential(stored: string, actor: string): void {
    this.db.run(`INSERT OR REPLACE INTO application_settings(key, value, updated_at, updated_by) VALUES ('vault.admin_credential', ?, ?, ?)`, [
      stored,
      new Date().toISOString(),
      actor,
    ])
  }

  getRaw(key: string): string | null {
    return this.db.value<string>('SELECT value FROM application_settings WHERE key = ?', [key]) ?? null
  }

  setRaw(key: string, value: string, actor = 'system'): void {
    this.db.run(`INSERT OR REPLACE INTO application_settings(key, value, updated_at, updated_by) VALUES (?,?,?,?)`, [
      key,
      value,
      new Date().toISOString(),
      actor,
    ])
  }
}
