import type { AppSettings, Role } from './types'

export const APP_VERSION = '1.0.0'
export const APP_TITLE = 'ZEUS VAULT'

export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Zeus Vault',
  theme: 'dark',
  language: 'en',
  dateFormat: 'utc',
  timezone: 'UTC',
  defaultCountry: 'US',
  sessionDurationDays: 90,
  singleSession: true,
  inactivityLockMinutes: 15,
  requirePasswordUnlock: true,
  passwordMinLength: 12,
  requireUpper: true,
  requireNumber: true,
  requireSymbol: true,
  passwordHistory: 5,
  loginMaxAttempts: 5,
  loginLockMinutes: 5,
  trackViews: true,
  clipboardClearSeconds: 30,
  animationIntensity: 'full',
  motionPreference: 'system',
  tableDensity: 'compact',
  fontScale: 1,
  previewBehavior: 'proximity',
  backgroundTexture: true,
  watermarkDemos: true,
  exportSensitiveDefault: false,
  backupRetention: 10,
  mcpEnabled: false,
  mcpPort: 7421,
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  standard: 'Standard User',
  readonly: 'Read-Only User',
}

export const DEFAULT_CATEGORIES = [
  { name: 'Personal', description: 'Personal contacts and individual dossiers', color: '#E34B64', icon: 'user' },
  { name: 'Professional', description: 'Work-related contacts and colleagues', color: '#D69B45', icon: 'briefcase' },
  { name: 'Business', description: 'Commercial partners and business entities', color: '#7A8B9A', icon: 'building' },
  { name: 'Client', description: 'Client records and account holders', color: '#4F8A6B', icon: 'handshake' },
  { name: 'Contact', description: 'General contact references', color: '#8A7FB0', icon: 'phone' },
  { name: 'Research', description: 'Research subjects and study records', color: '#5F8FB0', icon: 'flask' },
  { name: 'Test Data', description: 'Synthetic records used for training and testing', color: '#555B65', icon: 'test' },
  { name: 'Other', description: 'Unclassified records', color: '#858991', icon: 'archive' },
]

export const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say', 'Unknown']

export const PROFILE_STATUSES = ['Active', 'Inactive', 'Pending', 'Restricted']

export const ACCOUNT_STATUSES = ['Active', 'Dormant', 'Compromised', 'Closed']

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'ja', name: 'Japanese' },
]

export const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export const DATE_FORMATS = [
  { id: 'utc', label: '2026-11-06 13:30:45 UTC' },
  { id: 'military', label: '06 NOV 2026 / 133045Z' },
  { id: 'iso', label: '2026-11-06 1330Z' },
  { id: 'readable', label: '06 NOV 2026 / 13:30:45' },
  { id: 'relative', label: 'Relative' },
]

export const EVENT_LABELS: Record<string, string> = {
  PROFILE_CREATED: 'Profile Created',
  PROFILE_UPDATED: 'Profile Updated',
  FIELD_UPDATED: 'Field Updated',
  PROFILE_ARCHIVED: 'Profile Archived',
  PROFILE_RESTORED: 'Profile Restored',
  PROFILE_DELETED: 'Profile Deleted',
  PROFILE_EXPORTED: 'Profile Exported',
  PROFILE_VIEWED: 'Profile Viewed',
  PROFILE_DUPLICATED: 'Profile Duplicated',
  PROFILE_IMAGE_CHANGED: 'Profile Image Changed',
  PROFILE_FAVORITED: 'Favorited Added',
  PROFILE_UNFAVORITED: 'Favorited Removed',
  ATTACHMENT_ADDED: 'Attachment Added',
  ATTACHMENT_REMOVED: 'Attachment Removed',
  USER_LOGIN: 'User Login',
  USER_LOGOUT: 'User Logout',
  FAILED_LOGIN: 'Failed Login',
  PASSWORD_CHANGED: 'Password Changed',
  ACCOUNT_UPDATED: 'Account Updated',
  SESSION_REVOKED: 'Session Revoked',
  VAULT_LOCKED: 'Vault Locked',
  VAULT_UNLOCKED: 'Vault Unlocked',
  USER_CREATED: 'User Created',
  USER_UPDATED: 'User Updated',
  USER_SUSPENDED: 'User Suspended',
  USER_UPDATED_BY_ADMIN: 'User Updated',
  CATEGORY_CREATED: 'Category Created',
  CATEGORY_UPDATED: 'Category Updated',
  CATEGORY_DELETED: 'Category Deleted',
  IMPORT_COMPLETED: 'Import Completed',
  EXPORT_COMPLETED: 'Export Completed',
  BACKUP_CREATED: 'Backup Created',
  BACKUP_RESTORED: 'Backup Restored',
  SETTINGS_UPDATED: 'Settings Updated',
  SEARCH_SAVED: 'Search Saved',
  INTEGRITY_CHECK: 'Integrity Check',
  B2B_CONTACT_CREATED: 'B2B Contact Created',
  B2B_CONTACT_UPDATED: 'B2B Contact Updated',
  B2B_FIELD_UPDATED: 'B2B Field Updated',
  B2B_CONTACT_DELETED: 'B2B Contact Deleted',
  B2B_EXPORTED: 'B2B Contacts Exported',
  APIKEY_CREATED: 'API Key Created',
  APIKEY_REVOKED: 'API Key Revoked',
}

export const EVENT_CATEGORIES: Record<string, 'PROFILE' | 'IDENTITY' | 'SYSTEM'> = {
  PROFILE_CREATED: 'PROFILE',
  PROFILE_UPDATED: 'PROFILE',
  FIELD_UPDATED: 'PROFILE',
  PROFILE_ARCHIVED: 'PROFILE',
  PROFILE_RESTORED: 'PROFILE',
  PROFILE_DELETED: 'PROFILE',
  PROFILE_EXPORTED: 'PROFILE',
  PROFILE_VIEWED: 'PROFILE',
  PROFILE_DUPLICATED: 'PROFILE',
  PROFILE_IMAGE_CHANGED: 'PROFILE',
  PROFILE_FAVORITED: 'PROFILE',
  PROFILE_UNFAVORITED: 'PROFILE',
  ATTACHMENT_ADDED: 'PROFILE',
  ATTACHMENT_REMOVED: 'PROFILE',
  USER_LOGIN: 'IDENTITY',
  USER_LOGOUT: 'IDENTITY',
  FAILED_LOGIN: 'IDENTITY',
  PASSWORD_CHANGED: 'IDENTITY',
  ACCOUNT_UPDATED: 'IDENTITY',
  SESSION_REVOKED: 'IDENTITY',
  VAULT_LOCKED: 'IDENTITY',
  VAULT_UNLOCKED: 'IDENTITY',
}

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
export const PAGE_SIZES = [25, 50, 100, 250]
