import type {
  ApiResult,
  AppInfo,
  AppSettings,
  AuditEntry,
  BackupEntry,
  B2bContact,
  B2bInput,
  B2bListQuery,
  CategoryRecord,
  DashboardData,
  CountryStat,
  FieldHistoryEntry,
  ImportPreview,
  ImportResult,
  IntegrityResult,
  LoginHistoryEntry,
  NlpExtractResult,
  Paginated,
  ProfileDetail,
  ProfileFilters,
  ProfileInput,
  ProfileListItem,
  ProfileQuery,
  Role,
  SavedSearch,
  SearchInterpretation,
  SearchResults,
  SecurityCenterData,
  SessionState,
  SessionUser,
  SetupInput,
  SetupStatus,
  TagRecord,
  UpdateProfileResult,
  UserRecord,
  UserSessionInfo,
} from './types'

export interface ZeusApi {
  setup: {
    status: () => Promise<ApiResult<SetupStatus>>
    initialize: (input: SetupInput) => Promise<ApiResult<{ ok: boolean }>>
  }
  session: {
    bootstrap: () => Promise<ApiResult<SessionState>>
    login: (payload: { username: string; password: string; remember?: boolean; deviceId?: string }) => Promise<ApiResult<{
      user: SessionUser
      session: { id: string; expiresAt: string; deviceName: string; createdAt: string; sessionRef: string }
      app: AppInfo
    }>>
    unlock: (payload: { password: string; keepSession: boolean }) => Promise<ApiResult<{ user: SessionUser }>>
    lock: () => Promise<ApiResult<{ locked: boolean }>>
    logout: () => Promise<ApiResult<{ ok: boolean }>>
    touch: () => Promise<ApiResult<{ ok: boolean }>>
    appInfo: () => Promise<ApiResult<AppInfo>>
  }
  dashboard: {
    overview: () => Promise<ApiResult<DashboardData>>
  }
  profiles: {
    list: (query: ProfileQuery) => Promise<ApiResult<Paginated<ProfileListItem>>>
    get: (id: string) => Promise<ApiResult<ProfileDetail>>
    create: (input: ProfileInput) => Promise<ApiResult<{ id: string; profileCode: string }>>
    update: (payload: { id: string; input: ProfileInput }) => Promise<ApiResult<UpdateProfileResult>>
    archive: (id: string) => Promise<ApiResult<null>>
    restore: (id: string) => Promise<ApiResult<null>>
    remove: (id: string) => Promise<ApiResult<null>>
    duplicate: (id: string) => Promise<ApiResult<{ id: string; profileCode: string }>>
    toggleFavorite: (id: string) => Promise<ApiResult<{ isFavorite: boolean }>>
    fieldHistory: (id: string) => Promise<ApiResult<FieldHistoryEntry[]>>
    audit: (id: string) => Promise<ApiResult<AuditEntry[]>>
    setAvatar: (payload: { id: string; dataUrl: string | null }) => Promise<ApiResult<void>>
    addGalleryImage: (payload: { id: string; name: string; dataUrl: string }) => Promise<ApiResult<string>>
    removeGalleryImage: (id: string) => Promise<ApiResult<void>>
    addAttachment: (payload: { id: string; name: string; mime: string; dataUrl: string; category?: string }) => Promise<ApiResult<string>>
    removeAttachment: (id: string) => Promise<ApiResult<void>>
    composeCopyText: (payload: { id: string; includeSecrets: boolean }) => Promise<ApiResult<string>>
  }
  search: {
    query: (payload: { text: string; page?: number; pageSize?: number }) => Promise<ApiResult<SearchResults>>
    saved: () => Promise<ApiResult<SavedSearch[]>>
    save: (payload: { name: string; query: string; filters?: ProfileFilters | null }) => Promise<ApiResult<SavedSearch>>
    deleteSaved: (id: string) => Promise<ApiResult<void>>
    recent: () => Promise<ApiResult<{ id: string; mode: string; command: string; createdAt: string }[]>>
    tags: () => Promise<ApiResult<TagRecord[]>>
    countryStats: () => Promise<ApiResult<CountryStat[]>>
  }
  nlp: {
    extract: (text: string) => Promise<ApiResult<NlpExtractResult>>
    interpret: (text: string) => Promise<ApiResult<SearchInterpretation>>
    aliases: () => Promise<ApiResult<import('./types').NlpAlias[]>>
    addAlias: (payload: { alias: string; canonical: string }) => Promise<ApiResult<null>>
    deleteAlias: (alias: string) => Promise<ApiResult<null>>
    embedAll: () => Promise<ApiResult<{ embedded: number }>>
    semantic: (text: string) => Promise<ApiResult<{ profileId: string; score: number }[]>>
  }
  photos: {
    status: () => Promise<ApiResult<import('./types').PhotoQueueStatus>>
    enqueueAll: () => Promise<ApiResult<{ queued: number }>>
    search: (payload: { dataUrl: string; view?: string; categoryId?: string; country?: string; text?: string; minScore?: number }) => Promise<ApiResult<{ query: string; faceDetected: boolean; matches: import('./types').PhotoMatch[] }>>
    recheck: (profileId: string) => Promise<ApiResult<{ phash: string; faceDetected: boolean }>>
    profile: (profileId: string) => Promise<ApiResult<{ kind: string; status: string; faceDetected: boolean; phash: string | null }[]>>
    matchFace: (cropDataUrl: string) => Promise<ApiResult<{ profileId: string; score: number; phashSim: number; faceSim: number | null; name: string; code: string; avatar: string | null }[]>>
    saveFace: (payload: { profileId: string; cropDataUrl: string }) => Promise<ApiResult<{ tokenId: string }>>
    docStatus: () => Promise<ApiResult<{ queued: number; processing: number; done: number; failed: number; lastError: string | null }>>
    ocrAll: () => Promise<ApiResult<{ queued: number }>>
    docSearch: (text: string) => Promise<ApiResult<{ attachmentId: string; profileId: string; name: string; snippet: string }[]>>
  }
  categories: {
    list: () => Promise<ApiResult<CategoryRecord[]>>
    create: (input: { name: string; description?: string; color?: string; icon?: string }) => Promise<ApiResult<CategoryRecord>>
    update: (payload: { id: string; name?: string; description?: string; color?: string; icon?: string }) => Promise<ApiResult<CategoryRecord>>
    delete: (payload: { id: string; reassignTo?: string | null }) => Promise<ApiResult<void>>
  }
  audit: {
    list: (query: {
      page?: number
      pageSize?: number
      eventType?: string
      category?: 'PROFILE' | 'IDENTITY' | 'SYSTEM'
      actorId?: string
      search?: string
      from?: string
      to?: string
    }) => Promise<ApiResult<{ rows: AuditEntry[]; total: number }>>
    verify: () => Promise<ApiResult<{ ok: boolean; checked: number; brokenAt: string | null }>>
  }
  users: {
    list: () => Promise<ApiResult<UserRecord[]>>
    create: (input: { fullName: string; username: string; email: string; password: string; role: Role }) => Promise<ApiResult<UserRecord>>
    update: (payload: { id: string; patch: { fullName?: string; username?: string; email?: string; role?: Role; status?: 'active' | 'suspended' } }) => Promise<ApiResult<UserRecord>>
    resetPassword: (payload: { id: string; newPassword: string }) => Promise<ApiResult<void>>
    sessions: (id: string) => Promise<ApiResult<UserSessionInfo[]>>
    revokeSessions: (id: string) => Promise<ApiResult<number>>
    loginHistory: (id: string) => Promise<ApiResult<LoginHistoryEntry[]>>
  }
  account: {
    updateProfile: (payload: { fullName?: string; username?: string; email?: string; currentPassword?: string }) => Promise<ApiResult<UserRecord>>
    setAvatar: (dataUrl: string | null) => Promise<ApiResult<{ ok: boolean }>>
    changePassword: (payload: { currentPassword: string; newPassword: string }) => Promise<ApiResult<void>>
    sessions: () => Promise<ApiResult<UserSessionInfo[]>>
    revokeSession: (sessionId: string) => Promise<ApiResult<void>>
    logoutAll: () => Promise<ApiResult<{ revoked: number }>>
    loginHistory: () => Promise<ApiResult<LoginHistoryEntry[]>>
  }
  settings: {
    get: () => Promise<ApiResult<AppSettings>>
    update: (patch: Partial<AppSettings>) => Promise<ApiResult<AppSettings>>
  }
  importexport: {
    pickFile: () => Promise<ApiResult<{ filePath: string } | null>>
    pickSave: (payload: { format: string; defaultName?: string }) => Promise<ApiResult<{ filePath: string } | null>>
    preview: (filePath: string) => Promise<ApiResult<ImportPreview>>
    execute: (payload: { filePath: string; mapping: Record<string, string> }) => Promise<ApiResult<ImportResult>>
    exportProfiles: (payload: { ids?: string[]; filters?: ProfileFilters; format: 'csv' | 'json' | 'xlsx' | 'pdf'; includeSensitive: boolean; targetPath?: string }) => Promise<ApiResult<{ filePath: string; count: number }>>
    exportDossier: (payload: { id: string; includeSensitive: boolean; targetPath?: string }) => Promise<ApiResult<{ filePath: string }>>
    showItem: (filePath: string) => Promise<ApiResult<{ ok: boolean }>>
  }
  backup: {
    create: (payload: { mode: 'encrypted' | 'plain'; label?: string }) => Promise<ApiResult<BackupEntry>>
    list: () => Promise<ApiResult<BackupEntry[]>>
    delete: (id: string) => Promise<ApiResult<void>>
    restore: (id: string) => Promise<ApiResult<{ ok: boolean; relaunch: boolean }>>
  }
  b2b: {
    list: (query: B2bListQuery) => Promise<ApiResult<import('./types').Paginated<B2bContact>>>
    get: (id: string) => Promise<ApiResult<B2bContact>>
    create: (input: B2bInput) => Promise<ApiResult<B2bContact>>
    update: (payload: { id: string; input: B2bInput }) => Promise<ApiResult<B2bContact>>
    setFavorite: (payload: { id: string; favorite: boolean }) => Promise<ApiResult<B2bContact>>
    remove: (id: string) => Promise<ApiResult<void>>
    industries: () => Promise<ApiResult<string[]>>
    exportCsv: (query: B2bListQuery & { targetPath?: string }) => Promise<ApiResult<{ filePath: string; count: number }>>
  }
  security: {
    integrity: () => Promise<ApiResult<IntegrityResult>>
    center: () => Promise<ApiResult<SecurityCenterData>>
    verifyAudit: () => Promise<ApiResult<{ ok: boolean; checked: number; brokenAt: string | null }>>
  }
  window: {
    minimize: () => Promise<ApiResult<{ ok: boolean }>>
    toggleMaximize: () => Promise<ApiResult<{ maximized: boolean }>>
    close: () => Promise<ApiResult<{ ok: boolean }>>
    isMaximized: () => Promise<ApiResult<{ maximized: boolean }>>
    onMaximizedChange: (callback: (v: boolean) => void) => () => void
  }
  mcp: {
    getInfo: () => Promise<ApiResult<{ enabled: boolean; running: boolean; port: number; hasToken: boolean; token: string | null; url: string; header: string }>>
    regenerateToken: () => Promise<ApiResult<{ token: string }>>
    setEnabled: (enabled: boolean) => Promise<ApiResult<AppSettings>>
  }
  apikeys: {
    generate: (label?: string) => Promise<ApiResult<import('./types').GeneratedApiKey>>
    list: () => Promise<ApiResult<import('./types').ApiKeyListItem[]>>
    revoke: (id: string) => Promise<ApiResult<void>>
  }
  system: {
    onVaultLocked: (callback: () => void) => () => void
  }
}
