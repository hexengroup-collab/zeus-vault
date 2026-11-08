import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import type { AppContext } from './services/context'
import { AppError } from './lib/errors'
import { verifyPassword } from './lib/crypto'
import type {
  ApiResult,
  AppInfo,
  AppSettings,
  ProfileFilters,
  ProfileInput,
  SearchResults,
  SetupInput,
  Role,
} from '../shared/types'
import { extractFields, applyUserAliases } from './nlp/engine'
import { interpretQuery } from './nlp/query'

type Gate = 'none' | 'session' | 'unlock' | 'standard' | 'admin' | 'readonly'

const ROLE_RANK: Record<Role, number> = { readonly: 1, standard: 2, admin: 3 }

function ok<T>(result: T): ApiResult<T> {
  return { ok: true, result }
}

function fail(e: unknown): ApiResult<never> {
  if (e instanceof AppError) {
    return { ok: false, error: { code: e.code, message: e.message, fields: e.fields } }
  }
  const message = e instanceof Error ? e.message : String(e)
  return { ok: false, error: { code: 'INTERNAL', message } }
}

export function registerIpc(ctx: AppContext): void {
  const handle = <TArgs extends unknown[], TResult>(
    channel: string,
    gate: Gate,
    fn: (...args: TArgs) => TResult | Promise<TResult>,
  ) => {
    ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<ApiResult<Awaited<TResult>>> => {
      try {
        authorize(ctx, gate)
        const result = await fn(...(args as TArgs))
        return ok(result as Awaited<TResult>)
      } catch (e) {
        return fail(e)
      }
    })
  }

  const actorOf = (deviceName?: string) => ctx.auth!.actor(deviceName)
  const userIdOf = () => ctx.auth!.requireUser().id
  const requireAdmin = () => {
    const u = ctx.auth!.requireUser()
    if (u.role !== 'admin') throw new AppError('FORBIDDEN', 'Administrator privileges required.')
    return u
  }

  const buildAppInfo = (): AppInfo => {
    const v = ctx.vault!
    const s = ctx.settings!
    const settings = s.get()
    const encryptedFields = Number(v.db.value<number>(`SELECT COUNT(*) FROM profile_accounts WHERE password_enc <> ''`) ?? 0)
    return {
      name: settings.appName,
      version: '1.0.0',
      platform: process.platform,
      dataDir: ctx.paths.dataDir,
      dbPath: ctx.paths.dbPath,
      storageReady: true,
      osKeychain: ctx.encryptionAvailable(),
      encryptionActive: true,
      integrityOk: true,
      fingerprints: v.fingerprints,
      encryptedFields,
      demoSeeded: ctx.auth!.isDemoSeeded(),
      dbBytes: v.sizeOnDisk(),
    }
  }

  // ---------------- setup ----------------
  handle('setup:status', 'none', () => ({
    initialized: ctx.isInitialized(),
    hasUsers: ctx.isInitialized() ? ctx.open() ? ctx.auth!.hasUsers() : false : false,
    encryptionAvailable: ctx.encryptionAvailable(),
    osKeychain: ctx.encryptionAvailable(),
  }))

  handle('setup:initialize', 'none', (input: SetupInput) => {
    ctx.initialize(input)
    return { ok: true }
  })

  // ---------------- session ----------------
  handle('session:bootstrap', 'none', () => {
    if (!ctx.isInitialized()) return { state: 'unauthenticated' as const }
    ctx.open()
    const restored = ctx.auth!.restoreSession(ctx.deviceName())
    if (!restored) return { state: 'unauthenticated' as const }
    if (ctx.auth!.lockState.locked) return { state: 'locked' as const, user: restored.user }
    return {
      state: 'authenticated' as const,
      user: restored.user,
      session: {
        id: restored.session.id,
        expiresAt: new Date(restored.session.expiresAt).toISOString(),
        deviceName: restored.session.deviceName,
        createdAt: restored.session.createdAt,
        sessionRef: restored.session.sessionRef,
      },
      app: buildAppInfo(),
      setupRequired: false,
    }
  })

  handle('session:login', 'none', (payload: { username: string; password: string; remember?: boolean; deviceId?: string }) => {
    ctx.open()
    const { user, session } = ctx.auth!.login(payload.username, payload.password, {
      deviceId: payload.deviceId,
      deviceName: ctx.deviceName(),
      remember: payload.remember,
    })
    return {
      user,
      session: {
        id: session.id,
        expiresAt: new Date(session.expiresAt).toISOString(),
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        sessionRef: session.sessionRef,
      },
      app: buildAppInfo(),
    }
  })

  handle('session:unlock', 'session', (payload: { password: string; keepSession: boolean }) => {
    return ctx.auth!.unlock(payload.password, payload.keepSession, ctx.deviceName())
  })

  handle('session:lock', 'session', () => {
    ctx.auth!.lock('Manual lock')
    return { locked: true }
  })

  handle('session:logout', 'session', () => {
    try { ctx.mcp?.stop() } catch { /* ignore */ }
    ctx.auth!.logout()
    return { ok: true }
  })

  handle('session:touch', 'session', () => {
    ctx.auth!.touch()
    return { ok: true }
  })

  handle('session:appInfo', 'session', () => buildAppInfo())

  // ---------------- dashboard ----------------
  handle('dashboard:overview', 'unlock', () => ctx.dashboard!.overview(userIdOf()))

  // ---------------- profiles ----------------
  handle('profiles:list', 'unlock', (query: ProfileFilters & { page?: number; pageSize?: number }) =>
    ctx.profiles!.list(query ?? {}, userIdOf()),
  )

  handle('profiles:get', 'unlock', (id: string) => {
    ctx.auth!.requireUser()
    return ctx.profiles!.get(id, actorOf(), { trackView: true })
  })

  handle('profiles:create', 'standard', (input: ProfileInput) => {
    const detail = ctx.profiles!.create(input, actorOf())
    return { id: detail.id, profileCode: detail.profileCode }
  })

  handle('profiles:update', 'standard', (payload: { id: string; input: ProfileInput }) =>
    ctx.profiles!.update(payload.id, payload.input, actorOf()),
  )

  handle('profiles:archive', 'standard', (id: string) => ctx.profiles!.setStatus(id, 'archive', actorOf()))
  handle('profiles:restore', 'standard', (id: string) => ctx.profiles!.setStatus(id, 'restore', actorOf()))
  handle('profiles:delete', 'standard', (id: string) => ctx.profiles!.setStatus(id, 'delete', actorOf()))

  handle('profiles:duplicate', 'standard', (id: string) => {
    const copy = ctx.profiles!.duplicate(id, actorOf())
    return { id: copy.id, profileCode: copy.profileCode }
  })

  handle('profiles:toggleFavorite', 'unlock', (id: string) => ctx.profiles!.toggleFavorite(id, actorOf()))
  handle('profiles:fieldHistory', 'unlock', (id: string) => ctx.profiles!.fieldHistory(id))
  handle('profiles:audit', 'unlock', (id: string) => ctx.profiles!.profileAudit(id))

  handle('profiles:setAvatar', 'standard', (payload: { id: string; dataUrl: string | null }) =>
    ctx.profiles!.setAvatar(payload.id, payload.dataUrl, actorOf()),
  )
  handle('profiles:addGalleryImage', 'standard', (payload: { id: string; name: string; dataUrl: string }) =>
    ctx.profiles!.addGalleryImage(payload.id, payload.name, payload.dataUrl, actorOf()),
  )
  handle('profiles:removeGalleryImage', 'standard', (imageId: string) => ctx.profiles!.removeGalleryImage(imageId, actorOf()))
  handle('profiles:addAttachment', 'standard', (payload: { id: string; name: string; mime: string; dataUrl: string; category?: string }) =>
    ctx.profiles!.addAttachment(payload.id, payload.name, payload.mime, payload.dataUrl, payload.category ?? 'documents', actorOf()),
  )
  handle('profiles:removeAttachment', 'standard', (id: string) => ctx.profiles!.removeAttachment(id, actorOf()))
  handle('profiles:composeCopyText', 'unlock', (payload: { id: string; includeSecrets: boolean }) =>
    ctx.profiles!.composeCopyText(payload.id, payload.includeSecrets),
  )

  // ---------------- search & NLP ----------------
  handle('search:query', 'unlock', (payload: { text: string; page?: number; pageSize?: number }) => {
    const raw = String(payload.text ?? '').slice(0, 500)
    const q = applyUserAliases(raw, ctx.nlp!.aliasMap())
    const page = Math.max(1, Number(payload.page) || 1)
    const pageSize = Math.min(250, Math.max(1, Number(payload.pageSize) || 50))
    const result: SearchResults = ctx.search!.search(q, page, pageSize, actorOf())
    ctx.search!.recordSearch(userIdOf(), 'search', raw, { total: result.total, clauses: result.interpretation.clauses.length })
    return result
  })

  handle('search:saved', 'unlock', () => ctx.search!.savedSearches(userIdOf()))
  handle('search:save', 'unlock', (payload: { name: string; query: string; filters?: ProfileFilters | null }) =>
    ctx.search!.saveSearch(payload.name, payload.query, payload.filters ?? null, { ...actorOf(), userId: userIdOf() }),
  )
  handle('search:deleteSaved', 'unlock', (id: string) => ctx.search!.deleteSavedSearch(id, userIdOf()))
  handle('search:recent', 'unlock', () => ctx.search!.recentSearches(userIdOf()))
  handle('search:tags', 'unlock', () => ctx.search!.tags())
  handle('search:countryStats', 'unlock', () => ctx.search!.countryStats())

  handle('nlp:extract', 'unlock', (text: string) => {
    const result = extractFields(applyUserAliases(String(text ?? '').slice(0, 4000), ctx.nlp!.aliasMap()))
    ctx.search!.recordSearch(userIdOf(), 'extract', String(text).slice(0, 4000), { fields: result.fields.length })
    return result
  })

  handle('nlp:interpret', 'unlock', (text: string) => interpretQuery(String(text ?? '').slice(0, 500), { currentUsername: ctx.auth?.currentUser()?.username }))
  handle('nlp:aliases', 'unlock', () => {
    const aliases = ctx.nlp!.aliases()
    return aliases.length > 500 ? aliases.slice(0, 500) : aliases
  })
  handle('nlp:addAlias', 'standard', (payload: { alias: string; canonical: string }) => {
    ctx.nlp!.addAlias(String(payload.alias ?? ''), String(payload.canonical ?? ''), actorOf())
    return null
  })
  handle('nlp:deleteAlias', 'standard', (alias: string) => {
    ctx.nlp!.deleteAlias(String(alias ?? ''))
    return null
  })
  handle('nlp:embedAll', 'standard', () => ctx.nlp!.embedAll())
  handle('nlp:semantic', 'unlock', (text: string) => ctx.nlp!.semanticSearch(String(text ?? '').slice(0, 1000)))

  handle('photos:status', 'unlock', () => ctx.photos!.status({ ...actorOf(), userId: userIdOf() } as never))
  handle('photos:enqueueAll', 'standard', () => ctx.photos!.enqueueAllProfiles())
  handle('photos:search', 'unlock', (payload: { dataUrl: string; view?: string; categoryId?: string; country?: string; text?: string; minScore?: number; kinds?: ('avatar' | 'gallery' | 'attachment')[] }) => ctx.photos!.search(String(payload.dataUrl ?? ''), { view: payload.view, categoryId: payload.categoryId, country: payload.country, text: payload.text, minScore: payload.minScore, kinds: payload.kinds }))
  handle('photos:recheck', 'unlock', (profileId: string) => ctx.photos!.recheck(String(profileId ?? '')))
  handle('photos:profile', 'unlock', (profileId: string) => ctx.photos!.profileTokens(String(profileId ?? '')))
  handle('photos:saveFace', 'standard', (payload: { profileId: string; cropDataUrl: string; geom?: number[]; desc?: number[] }) => ctx.photos!.saveFace(String(payload.profileId ?? ''), String(payload.cropDataUrl ?? ''), Array.isArray(payload.geom) ? payload.geom : null, Array.isArray(payload.desc) ? payload.desc : null))
  handle('photos:matchFace', 'unlock', (payload: { cropDataUrl?: string; geom?: number[]; desc?: number[]; quality?: number } | string) => {
    if (typeof payload === 'string') return ctx.photos!.matchFace(payload)
    return ctx.photos!.matchFace(String(payload.cropDataUrl ?? ''), Array.isArray(payload.geom) ? payload.geom : null, Array.isArray(payload.desc) ? payload.desc : null, typeof payload.quality === 'number' ? payload.quality : 1)
  })
  handle('photos:saveGeom', 'standard', (payload: { profileId: string; geom: number[]; kind?: 'avatar' | 'gallery' | 'attachment' }) => {
    ctx.photos!.saveGeom(String(payload.profileId ?? ''), payload.geom, payload.kind ?? 'avatar')
    return null
  })
  handle('photos:saveDesc', 'standard', (payload: { profileId: string; desc: number[]; kind?: 'avatar' | 'gallery' | 'attachment' }) => {
    ctx.photos!.saveDesc(String(payload.profileId ?? ''), payload.desc, payload.kind ?? 'avatar')
    return null
  })
  handle('docs:status', 'unlock', () => ctx.docs!.status({ ...actorOf(), userId: userIdOf() } as never))
  handle('docs:ocrAll', 'standard', () => ctx.docs!.enqueueAll())
  handle('docs:search', 'unlock', (text: string) => ctx.docs!.search(String(text ?? '')))

  // ---------------- categories ----------------
  handle('categories:list', 'unlock', () => ctx.categories!.list())
  handle('categories:create', 'standard', (input: { name: string; description?: string; color?: string; icon?: string }) =>
    ctx.categories!.create(input, actorOf()),
  )
  handle('categories:update', 'standard', (payload: { id: string; name?: string; description?: string; color?: string; icon?: string }) => {
    const { id, ...patch } = payload
    return ctx.categories!.update(id, patch, actorOf())
  })
  handle('categories:delete', 'standard', (payload: { id: string; reassignTo?: string | null }) =>
    ctx.categories!.delete(payload.id, payload.reassignTo ?? null, actorOf()),
  )

  // ---------------- audit ----------------
  handle('audit:list', 'unlock', (query: {
    page?: number
    pageSize?: number
    eventType?: string
    category?: 'PROFILE' | 'IDENTITY' | 'SYSTEM'
    actorId?: string
    search?: string
    from?: string
    to?: string
  }) => {
    const user = ctx.auth!.requireUser()
    const q = { ...query }
    if (user.role !== 'admin') q.actorId = user.id // standard & readonly users see only their own activity
    return ctx.audit!.list(q)
  })
  handle('audit:verify', 'unlock', () => ctx.audit!.verifyChain())

  // ---------------- users (admin) ----------------
  handle('users:list', 'admin', () => ctx.users!.list())
  handle('users:create', 'admin', (input: { fullName: string; username: string; email: string; password: string; role: Role }) =>
    ctx.users!.create(input, actorOf()),
  )
  handle('users:update', 'admin', (payload: { id: string; patch: { fullName?: string; username?: string; email?: string; role?: Role; status?: 'active' | 'suspended' } }) =>
    ctx.users!.update(payload.id, payload.patch, actorOf()),
  )
  handle('users:resetPassword', 'admin', (payload: { id: string; newPassword: string }) =>
    ctx.users!.resetPassword(payload.id, payload.newPassword, actorOf()),
  )
  handle('users:sessions', 'admin', (id: string) => ctx.users!.sessions(id))
  handle('users:revokeSessions', 'admin', (id: string) => ctx.users!.revokeSessions(id, actorOf()))
  handle('users:loginHistory', 'admin', (id: string) => ctx.users!.loginHistory(id))

  // ---------------- my account ----------------
  handle('account:updateProfile', 'unlock', (payload: { fullName?: string; username?: string; email?: string; currentPassword?: string; avatar?: string | null }) => {
    const me = ctx.auth!.requireUser()
    const needsPassword = (payload.username && payload.username !== me.username) || (payload.email && payload.email !== me.email)
    if (needsPassword) {
      if (!payload.currentPassword) throw new AppError('VALIDATION', 'Current password is required to change username or email.', [{ field: 'currentPassword', message: 'Required.' }])
      const row = ctx.auth!.getUser(me.id)!
      if (!verifyPassword(payload.currentPassword, row.password_hash)) {
        throw new AppError('VALIDATION', 'Current password is incorrect.', [{ field: 'currentPassword', message: 'Incorrect password.' }])
      }
    }
    return ctx.users!.update(me.id, { fullName: payload.fullName, username: payload.username, email: payload.email }, actorOf())
  })

  handle('account:setAvatar', 'unlock', (dataUrl: string | null) => {
    const me = ctx.auth!.requireUser()
    if (dataUrl !== null && !/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) {
      throw new AppError('VALIDATION', 'Avatar must be a JPG, PNG or WebP image.')
    }
    if (dataUrl && dataUrl.length > 3_500_000) {
      throw new AppError('VALIDATION', 'Avatar image is too large (max 2 MB).')
    }
    ctx.vault!.db.run('UPDATE users SET avatar_blob = ?, updated_at = ? WHERE id = ?', [dataUrl, new Date().toISOString(), me.id])
    ctx.audit!.record(actorOf(), { eventType: 'ACCOUNT_UPDATED', targetType: 'user', targetId: me.id, targetLabel: me.username, detail: dataUrl ? 'Avatar updated' : 'Avatar removed' })
    return { ok: true }
  })

  handle('account:changePassword', 'unlock', (payload: { currentPassword: string; newPassword: string }) =>
    ctx.auth!.changePassword(payload.currentPassword, payload.newPassword, ctx.deviceName()),
  )

  handle('account:sessions', 'unlock', () => ctx.auth!.sessionsForUser(userIdOf()))
  handle('account:revokeSession', 'unlock', (sessionId: string) => ctx.auth!.revokeSession(userIdOf(), sessionId))
  handle('account:logoutAll', 'unlock', () => ({ revoked: ctx.auth!.revokeAllSessions(userIdOf()) }))
  handle('account:loginHistory', 'unlock', () => ctx.auth!.loginHistory(userIdOf()))

  // ---------------- settings ----------------
  handle('settings:get', 'unlock', () => ctx.settings!.get())
  handle('settings:update', 'admin', (patch: Partial<AppSettings>) => {
    const updated = ctx.settings!.update(patch, ctx.auth!.requireUser().username)
    ctx.audit!.record(actorOf(), { eventType: 'SETTINGS_UPDATED', targetType: 'settings', detail: `Updated: ${Object.keys(patch).join(', ')}` })
    return updated
  })

  // ---------------- import / export ----------------
  handle('import:pickFile', 'standard', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Select import file',
      properties: ['openFile'],
      filters: [
        { name: 'Import files', extensions: ['csv', 'json', 'xlsx', 'xlsm'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    return result.canceled || !result.filePaths[0] ? null : { filePath: result.filePaths[0] }
  })
  handle('import:preview', 'standard', (filePath: string) => ctx.transfer!.previewImport(String(filePath)))
  handle('import:execute', 'standard', (payload: { filePath: string; mapping: Record<string, string> }) =>
    ctx.transfer!.executeImport(payload.filePath, payload.mapping, actorOf()),
  )

  handle('export:profiles', 'unlock', (payload: { ids?: string[]; filters?: ProfileFilters; format: 'csv' | 'json' | 'xlsx' | 'pdf'; includeSensitive: boolean; targetPath?: string }) => {
    const categories = new Map(ctx.categories!.list().map((c) => [c.id, c.name]))
    return ctx.transfer!.exportProfiles(
      { ids: payload.ids, filters: payload.filters, format: payload.format ?? 'csv', includeSensitive: !!payload.includeSensitive, categoryNames: categories, targetPath: payload.targetPath || undefined },
      actorOf(),
    )
  })
  handle('export:dossier', 'unlock', (payload: { id: string; includeSensitive: boolean; targetPath?: string }) =>
    ctx.transfer!.exportDossierPdf(payload.id, !!payload.includeSensitive, actorOf(), payload.targetPath || undefined),
  )
  handle('export:showItem', 'unlock', (filePath: string) => {
    shell.showItemInFolder(String(filePath))
    return { ok: true }
  })

  handle('export:pickSave', 'unlock', async (payload: { format: string; defaultName?: string }) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const ext = ['csv', 'json', 'xlsx', 'pdf'].includes(payload.format) ? payload.format : 'csv'
    const raw = (payload.defaultName || `zeus-vault-export.${ext}`).replace(/^[^a-zA-Z0-9._-]+/, 'zeus-vault-export.')
    const finalName = raw.toLowerCase().endsWith(`.${ext}`) ? raw : `${raw}.${ext}`
    const result = await dialog.showSaveDialog(win, {
      title: 'Choose where to save the export',
      defaultPath: path.join(ctx.paths.exportsDir, finalName),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }],
      properties: ['createDirectory'],
    })
    return result.canceled || !result.filePath ? null : { filePath: result.filePath }
  })

  // ---------------- B2B contacts ----------------
  handle('b2b:list', 'unlock', (query: import('../shared/types').B2bListQuery = {}) => ctx.b2b!.list(query, userIdOf()))
  handle('b2b:get', 'unlock', (id: string) => ctx.b2b!.get(id))
  handle('b2b:create', 'standard', (input: import('../shared/types').B2bInput) => ctx.b2b!.create(input, actorOf()))
  handle('b2b:update', 'standard', (payload: { id: string; input: import('../shared/types').B2bInput }) =>
    ctx.b2b!.update(payload.id, payload.input, actorOf()),
  )
  handle('b2b:setFavorite', 'standard', (payload: { id: string; favorite: boolean }) =>
    ctx.b2b!.setFavorite(payload.id, !!payload.favorite, actorOf()),
  )
  handle('b2b:delete', 'standard', (id: string) => ctx.b2b!.remove(id, actorOf()))
  handle('b2b:industries', 'unlock', () => ctx.b2b!.industries())
  handle('b2b:exportCsv', 'unlock', (payload: import('../shared/types').B2bListQuery & { targetPath?: string } = {}) =>
    ctx.b2b!.exportCsv(payload, actorOf(), payload.targetPath || undefined),
  )

  // ---------------- backup & security ----------------
  handle('backup:create', 'admin', (payload: { mode: 'encrypted' | 'plain'; label?: string }) =>
    ctx.backup!.create(payload.mode === 'plain' ? 'plain' : 'encrypted', payload.label, actorOf()),
  )
  handle('backup:list', 'unlock', () => ctx.backup!.list())
  handle('backup:delete', 'admin', (id: string) => ctx.backup!.delete(id, actorOf()))
  handle('backup:restore', 'admin', async (id: string) => {
    requireAdmin()
    ctx.backup!.restore(id, (payload) => ctx.vault!.decryptSnapshot(payload), actorOf())
    // Give the renderer time to receive the response, then relaunch into the restored database.
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 400)
    return { ok: true, relaunch: true }
  })

  handle('security:integrity', 'unlock', () => ctx.security!.integrityCheck())
  handle('security:center', 'unlock', () => {
    const chain = ctx.audit!.verifyChain()
    const backups = ctx.backup!.list()
    return {
      encryptionActive: true,
      fieldFingerprint: ctx.vault!.fingerprints.field,
      dbFingerprint: ctx.vault!.fingerprints.db,
      protection: ctx.vault!.protection,
      auditChainOk: chain.ok,
      auditEntries: chain.checked,
      integrity: null,
      sessions: ctx.auth!.sessionsForUser(userIdOf()),
      loginHistory: ctx.auth!.loginHistory(userIdOf()),
      backupCount: backups.length,
    }
  })

  // ---------------- system ----------------
  handle('window:minimize', 'none', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
    return { ok: true }
  })
  handle('window:maximize', 'none', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    }
    return { maximized: win ? win.isMaximized() : false }
  })
  handle('window:close', 'none', () => {
    BrowserWindow.getFocusedWindow()?.close()
    return { ok: true }
  })
  handle('window:isMaximized', 'none', () => ({ maximized: BrowserWindow.getFocusedWindow()?.isMaximized() ?? false }))

  handle('system:appInfo', 'unlock', () => buildAppInfo())

  // ---------------- MCP layer ----------------
  handle('apikeys:generate', 'unlock', (label?: string) => ctx.apikeys!.generate(typeof label === 'string' ? label : null, actorOf()))
  handle('apikeys:list', 'unlock', () => {
    const user = ctx.auth!.requireUser()
    return ctx.apikeys!.list(user.id, user.role === 'admin')
  })
  handle('apikeys:revoke', 'unlock', (id: string) => ctx.apikeys!.revoke(id, actorOf()))

  handle('mcp:getInfo', 'unlock', () => {
    const layer = ctx.mcp
    if (!layer) throw new AppError('UNAVAILABLE', 'MCP layer is not bound yet.')
    const s = ctx.settings!.get()
    return {
      ...layer.status(),
      port: s.mcpPort,
      token: layer.token(),
      url: `http://127.0.0.1:${s.mcpPort}/mcp`,
      header: `Authorization: Bearer ${layer.token() ?? ''}`,
    }
  })
  handle('mcp:regenerateToken', 'admin', () => ({ token: ctx.mcp!.regenerateToken() }))
  handle('mcp:setEnabled', 'admin', (enabled: boolean) => {
    const updated = ctx.settings!.update({ mcpEnabled: !!enabled }, ctx.auth!.requireUser().username)
    ctx.audit!.record(actorOf(), { eventType: 'SETTINGS_UPDATED', targetType: 'settings', detail: `MCP layer ${enabled ? 'enabled' : 'disabled'}` })
    if (enabled) void ctx.mcp?.start().catch(() => undefined)
    else ctx.mcp?.stop()
    return updated
  })
}

function authorize(ctx: AppContext, gate: Gate): void {
  if (gate === 'none') return
  // Ensure the vault context is available
  ctx.requireReady()
  if (gate === 'session') {
    if (!ctx.auth!.session) throw new AppError('UNAUTHENTICATED', 'Authentication required.')
    return
  }
  if (gate === 'unlock' || gate === 'standard' || gate === 'admin' || gate === 'readonly') {
    ctx.auth!.requireUnlocked()
  }
  if (gate === 'standard' || gate === 'admin') {
    const u = ctx.auth!.requireUser()
    const min = gate === 'admin' ? 3 : 2
    if (ROLE_RANK[u.role] < min) throw new AppError('FORBIDDEN', 'Insufficient permissions.')
  }
}

export function broadcastLocked(window: BrowserWindow | null): void {
  window?.webContents.send('zeus:locked')
}
