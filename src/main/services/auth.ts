import type { Db } from '../db/sqlite'
import type { LoginHistoryEntry, Role, SessionUser, UserSessionInfo } from '../../shared/types'
import { AppError, assertFound } from '../lib/errors'
import { hashPassword, randomHex, sha256Hex, safeEqual, validatePassword, verifyPassword } from '../lib/crypto'
import { AuditService, type Actor } from './audit'
import type { SettingsService } from './settings'
import { InMemorySecretStore, type SecretStore } from './secrets'

export interface Session {
  id: string
  userId: string
  sessionRef: string
  deviceName: string
  createdAt: string
  expiresAt: number
  lastActivityAt: string
}

export interface LoginContext {
  deviceId?: string
  deviceName?: string
  remember?: boolean
  password?: string
  totpCode?: string
}

interface UserRow {
  id: string
  username: string
  full_name: string
  email: string
  password_hash: string
  role: Role
  status: string
  avatar_blob: string | null
  must_change_password: number
  failed_attempts: number
  locked_until: number | null
  created_at: string
  last_login: string | null
}

const SESSION_TOUCH_INTERVAL_MS = 60_000
const MAX_STORED_HISTORY = 200

export class AuthService {
  private current: Session | null = null
  private lastTouch = 0
  readonly lockState = { locked: false, since: 0 }

  constructor(
    private db: Db,
    private audit: AuditService,
    private settings: SettingsService,
    private secrets: SecretStore = new InMemorySecretStore(),
  ) {}  get session(): Session | null {
    return this.current
  }

  getUser(userId: string): UserRow | undefined {
    return this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
  }

  toSessionUser(u: {
    id: string
    username: string
    full_name: string
    email: string
    role: Role
    status: string
    avatar_blob: string | null
  }): SessionUser {
    return {
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      avatar: u.avatar_blob,
      status: u.status as SessionUser['status'],
    }
  }

  currentUser(): SessionUser | null {
    if (!this.current) return null
    const u = this.getUser(this.current.userId)
    return u ? this.toSessionUser(u) : null
  }

  requireUser(): SessionUser {
    const u = this.currentUser()
    if (!u) throw new AppError('UNAUTHENTICATED', 'Authentication required.')
    return u
  }

  requireUnlocked(): void {
    if (!this.current) throw new AppError('UNAUTHENTICATED', 'Authentication required.')
    if (this.lockState.locked) throw new AppError('LOCKED', 'Vault is locked. Re-enter your password.')
  }

  actor(deviceName?: string | null): Actor {
    const user = this.currentUser()
    return {
      id: user?.id ?? null,
      username: user?.username ?? 'system',
      sessionRef: this.current?.sessionRef ?? null,
      deviceName: deviceName ?? this.current?.deviceName ?? null,
    }
  }

  isDemoSeeded(): boolean {
    return this.settings.getRaw('vault.demo_seeded') === 'true'
  }

  hasUsers(): boolean {
    return Number(this.db.value<number>('SELECT COUNT(*) FROM users') ?? 0) > 0
  }

  private enforceSingleSession(userId: string, reason: string, actor: Actor): void {
    const active = this.db.all<{ id: string; session_ref: string }>(
      'SELECT id, session_ref FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL',
      [userId],
    )
    if (!active.length) return
    const now = new Date().toISOString()
    for (const s of active) {
      this.db.run('UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [now, reason, s.id])
      this.audit.record(actor, {
        eventType: 'SESSION_REVOKED',
        targetType: 'session',
        targetId: s.id,
        targetLabel: s.session_ref,
        detail: reason,
      })
    }
  }

  private createSession(userId: string, ctx: LoginContext, reasonPrefix: string): Session {
    const s = this.settings.get()
    const user = assertFound(this.getUser(userId), 'User')
    const actor: Actor = { id: userId, username: user.username, deviceName: ctx.deviceName ?? 'Unknown device' }
    if (s.singleSession) this.enforceSingleSession(userId, 'Superseded by a newer login', actor)
    const nowMs = Date.now()
    const session: Session = {
      id: crypto.randomUUID(),
      userId,
      sessionRef: randomHex(4).toUpperCase(),
      deviceName: ctx.deviceName?.slice(0, 80) || 'Unknown device',
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: nowMs + s.sessionDurationDays * 86_400_000,
      lastActivityAt: new Date(nowMs).toISOString(),
    }
    const token = randomHex(32)
    this.db.run(
      `INSERT INTO user_sessions(id, user_id, token_hash, session_ref, device_name, device_secret, ip, auth_method, created_at, last_seen_at, last_activity_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        session.id,
        userId,
        sha256Hex(token),
        session.sessionRef,
        session.deviceName,
        randomHex(16),
        'local',
        reasonPrefix,
        session.createdAt,
        session.createdAt,
        session.createdAt,
        session.expiresAt,
      ],
    )
    this.current = session
    this.lastTouch = nowMs
    this.lockState.locked = false
    this.db.run('UPDATE users SET last_login = ?, last_activity = ? WHERE id = ?', [session.createdAt, session.createdAt, userId])
    this.secrets.set('session', JSON.stringify({ token, userId, sessionRef: session.sessionRef }))
    this.audit.record(
      { ...actor, sessionRef: session.sessionRef },
      {
        eventType: 'USER_LOGIN',
        targetType: 'user',
        targetId: userId,
        targetLabel: user.username,
        detail: `Signed in on ${session.deviceName}${reasonPrefix === 'trusted-device' ? ' via trusted device' : ''}`,
      },
    )
    return session
  }

  login(username: string, password: string, ctx: LoginContext = {}): { user: SessionUser; session: Session } {
    const s = this.settings.get()
    const ident = (username || '').trim()
    if (!ident || !password) throw new AppError('VALIDATION', 'Username and password are required.')
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE username_lower = ? OR lower(email) = ?', [
      ident.toLowerCase(),
      ident.toLowerCase(),
    ])
    const fail: (detail: string) => never = (detail) => {
      this.audit.record({ id: user?.id ?? null, username: user?.username ?? ident.slice(0, 40), deviceName: ctx.deviceName ?? null }, {
        eventType: 'FAILED_LOGIN',
        targetType: 'user',
        targetId: user?.id ?? null,
        targetLabel: user?.username ?? ident.slice(0, 40),
        detail,
      })
      throw new AppError('LOGIN_FAILED', 'Invalid credentials. Access denied.')
    }
    if (!user) fail('Unknown username')
    if (user.status === 'suspended') {
      this.audit.record({ id: user.id, username: user.username }, {
        eventType: 'FAILED_LOGIN',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.username,
        detail: 'Account suspended',
      })
      throw new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended. Contact an administrator.')
    }
    const now = Date.now()
    if (user.locked_until && user.locked_until > now) {
      const mins = Math.ceil((user.locked_until - now) / 60_000)
      throw new AppError('ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${mins} minute(s).`)
    }
    if (!verifyPassword(password, user.password_hash)) {
      const attempts = user.failed_attempts + 1
      if (attempts >= s.loginMaxAttempts) {
        this.db.run('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?', [now + s.loginLockMinutes * 60_000, user.id])
        fail(`Brute-force protection engaged after ${attempts} failed attempts`)
      }
      this.db.run('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id])
      fail(`Invalid password (attempt ${attempts}/${s.loginMaxAttempts})`)
    }
    this.db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL, status = CASE WHEN status = \'locked\' THEN \'active\' ELSE status END WHERE id = ?', [user.id])
    if (ctx.deviceId && ctx.remember) this.rememberDevice(user.id, ctx.deviceId)
    const session = this.createSession(user.id, { ...ctx, deviceName: ctx.deviceName }, ctx.remember && ctx.deviceId ? 'trusted-device' : 'password')
    return { user: this.toSessionUser({ ...user, status: 'active' }), session }
  }

  private rememberDevice(userId: string, deviceId: string): void {
    const secret = randomHex(32)
    const expires = Date.now() + this.settings.get().sessionDurationDays * 86_400_000
    this.db.run(
      `INSERT INTO trusted_devices(id, device_id, user_id, token_hash, created_at, expires_at, last_used_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(device_id, user_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at, last_used_at = excluded.last_used_at`,
      [crypto.randomUUID(), deviceId, userId, sha256Hex(secret), new Date().toISOString(), expires, new Date().toISOString()],
    )
    this.secrets.set('device', JSON.stringify({ deviceId, userId, secret }))
  }

  /** Restores a persisted session on app start. Refuses if the session was revoked elsewhere. */
  restoreSession(deviceName: string): { user: SessionUser; session: Session } | null {
    const raw = this.secrets.get('session')
    if (!raw) return null
    let parsed: { token: string; userId: string; sessionRef: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    const row = this.db.get<{
      id: string
      user_id: string
      session_ref: string
      device_name: string
      created_at: string
      last_activity_at: string
      expires_at: number
      revoked_at: string | null
    }>('SELECT * FROM user_sessions WHERE token_hash = ?', [sha256Hex(parsed.token)])
    if (!row || row.revoked_at) {
      this.clearPersistedSession()
      return null
    }
    if (row.expires_at < Date.now()) {
      this.db.run('UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [new Date().toISOString(), 'Session expired', row.id])
      this.clearPersistedSession()
      return null
    }
    const user = this.getUser(row.user_id)
    if (!user || user.status !== 'active') {
      this.clearPersistedSession()
      return null
    }
    const session: Session = {
      id: row.id,
      userId: row.user_id,
      sessionRef: row.session_ref,
      deviceName: deviceName || row.device_name,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastActivityAt: row.last_activity_at,
    }
    this.current = session
    this.db.run('UPDATE user_sessions SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), row.id])
    const s = this.settings.get()
    const persistedLock = this.isVaultLockedPersisted()
    const inactiveMs = Date.now() - new Date(row.last_activity_at).getTime()
    // A manual or persisted lock survives restarts and never depends on activity time alone.
    this.lockState.locked = persistedLock || (s.requirePasswordUnlock && inactiveMs > s.inactivityLockMinutes * 60_000)
    this.lockState.since = this.lockState.locked ? Date.now() : 0
    return { user: this.toSessionUser(user), session }
  }

  touch(): void {
    if (!this.current || this.lockState.locked) return
    const now = Date.now()
    if (now - this.lastTouch < SESSION_TOUCH_INTERVAL_MS) return
    this.lastTouch = now
    const iso = new Date(now).toISOString()
    this.current.lastActivityAt = iso
    this.db.run('UPDATE user_sessions SET last_activity_at = ?, last_seen_at = ? WHERE id = ?', [iso, iso, this.current.id])
    this.db.run('UPDATE users SET last_activity = ? WHERE id = ?', [iso, this.current.userId])
  }

  checkVaultTimeout(): boolean {
    if (!this.current || this.lockState.locked) return this.lockState.locked
    const s = this.settings.get()
    const inactiveMs = Date.now() - new Date(this.current.lastActivityAt).getTime()
    if (inactiveMs > s.inactivityLockMinutes * 60_000) {
      this.lock('Inactivity timeout')
      return true
    }
    return false
  }

  lock(reason = 'Manual lock'): void {
    if (!this.current || this.lockState.locked) return
    this.lockState.locked = true
    this.lockState.since = Date.now()
    // Persist the lock so restarts and refreshes cannot silently drop it.
    this.db.run(`INSERT OR REPLACE INTO application_settings(key, value, updated_at) VALUES ('vault.locked', '1', ?)`, [new Date().toISOString()])
    this.audit.record(this.actor(), { eventType: 'VAULT_LOCKED', targetType: 'session', targetId: this.current.id, detail: reason })
  }

  private isVaultLockedPersisted(): boolean {
    try {
      const raw = this.db.value<string>(`SELECT value FROM application_settings WHERE key = 'vault.locked'`)
      return raw?.trim() === '1'
    } catch {
      return false
    }
  }

  private setVaultLockedPersisted(locked: boolean): void {
    try {
      if (locked) {
        this.db.run(`INSERT OR REPLACE INTO application_settings(key, value, updated_at) VALUES ('vault.locked', '1', ?)`, [new Date().toISOString()])
      } else {
        this.db.run(`DELETE FROM application_settings WHERE key = 'vault.locked'`)
      }
    } catch {
      /* non-fatal: the in-memory flag still governs this runtime */
    }
  }

  unlock(password: string, keepSession: boolean, deviceName: string): { user: SessionUser } {
    if (!this.current) throw new AppError('UNAUTHENTICATED', 'Authentication required.')
    const user = assertFound(this.getUser(this.current.userId), 'User')
    if (!verifyPassword(password, user.password_hash)) {
      this.audit.record({ id: user.id, username: user.username, deviceName }, {
        eventType: 'FAILED_LOGIN',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.username,
        detail: 'Failed unlock attempt',
      })
      throw new AppError('LOGIN_FAILED', 'Incorrect password. Vault remains locked.')
    }
    if (!keepSession) {
      this.revokeCurrent('Session terminated at unlock screen')
      this.setVaultLockedPersisted(false)
      throw new AppError('SESSION_TERMINATED', 'Session terminated. Sign in again.')
    }
    this.lockState.locked = false
    this.lockState.since = 0
    this.setVaultLockedPersisted(false)
    this.current.lastActivityAt = new Date().toISOString()
    this.db.run('UPDATE user_sessions SET last_activity_at = ? WHERE id = ?', [this.current.lastActivityAt, this.current.id])
    this.audit.record({ id: user.id, username: user.username, sessionRef: this.current.sessionRef, deviceName }, {
      eventType: 'VAULT_UNLOCKED',
      targetType: 'session',
      targetId: this.current.id,
      detail: 'Password verified',
    })
    return { user: this.toSessionUser(user) }
  }

  logout(): void {
    if (!this.current) return
    this.revokeCurrent('User signed out')
    this.setVaultLockedPersisted(false)
    this.clearPersistedSession()
    this.current = null
    this.lockState.locked = false
  }

  revokeCurrent(reason: string): void {
    if (!this.current) return
    const actor = this.actor()
    this.db.run('UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [
      new Date().toISOString(),
      reason,
      this.current.id,
    ])
    this.audit.record(actor, {
      eventType: 'USER_LOGOUT',
      targetType: 'session',
      targetId: this.current.id,
      targetLabel: this.current.sessionRef,
      detail: reason,
    })
  }

  revokeSession(userId: string, sessionId: string): void {
    const row = assertFound(
      this.db.get<{ id: string; session_ref: string; user_id: string }>('SELECT id, session_ref, user_id FROM user_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]),
      'Session',
    )
    this.db.run('UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [
      new Date().toISOString(),
      'Revoked by user',
      row.id,
    ])
    this.audit.record(this.actor(), { eventType: 'SESSION_REVOKED', targetType: 'session', targetId: row.id, targetLabel: row.session_ref, detail: 'Revoked from session manager' })
    if (this.current?.id === row.id) {
      this.current = null
      this.lockState.locked = false
      this.clearPersistedSession()
    }
  }

  revokeAllSessions(userId: string, exceptCurrent = false): number {
    const rows = this.db.all<{ id: string }>(
      'SELECT id FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL',
      [userId],
    )
    let n = 0
    for (const r of rows) {
      if (exceptCurrent && this.current?.id === r.id) continue
      this.db.run('UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [new Date().toISOString(), 'Revoked', r.id])
      n++
    }
    if (n) this.audit.record(this.actor(), { eventType: 'SESSION_REVOKED', targetType: 'user', targetId: userId, detail: `${n} active session(s) revoked` })
    return n
  }

  clearPersistedSession(): void {
    this.secrets.delete('session')
  }

  private auditPasswordChange(user: UserRow, actor: Actor, kind: string): void {
    this.db.run('INSERT INTO password_history(id, user_id, password_hash, changed_at, changed_by, session_ref) VALUES (?,?,?,?,?,?)', [
      crypto.randomUUID(),
      user.id,
      user.password_hash,
      new Date().toISOString(),
      actor.username,
      actor.sessionRef ?? null,
    ])
    const keep = this.settings.get().passwordHistory
    this.db.run(
      `DELETE FROM password_history WHERE user_id = ? AND id NOT IN (SELECT id FROM password_history WHERE user_id = ? ORDER BY changed_at DESC LIMIT ?)`,
      [user.id, user.id, keep],
    )
    this.audit.record(actor, { eventType: 'PASSWORD_CHANGED', targetType: 'user', targetId: user.id, targetLabel: user.username, detail: kind })
  }

  changePassword(currentPassword: string, newPassword: string, deviceName?: string): void {
    const me = this.requireUser()
    const user = assertFound(this.getUser(me.id), 'User')
    if (!verifyPassword(currentPassword, user.password_hash)) {
      throw new AppError('VALIDATION', 'Current password is incorrect.', [{ field: 'currentPassword', message: 'Incorrect password.' }])
    }
    const s = this.settings.get()
    const error = validatePassword(newPassword, { minLength: s.passwordMinLength, requireUpper: s.requireUpper, requireNumber: s.requireNumber, requireSymbol: s.requireSymbol })
    if (error) throw new AppError('VALIDATION', error, [{ field: 'newPassword', message: error }])
    if (verifyPassword(newPassword, user.password_hash)) {
      throw new AppError('VALIDATION', 'New password must differ from the current password.', [{ field: 'newPassword', message: 'Password reused.' }])
    }
    const history = this.db.all<{ password_hash: string }>('SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY changed_at DESC LIMIT ?', [user.id, s.passwordHistory])
    for (const h of history) {
      if (verifyPassword(newPassword, h.password_hash)) {
        throw new AppError('VALIDATION', `Password was used recently. History of ${s.passwordHistory} passwords is enforced.`, [
          { field: 'newPassword', message: 'Previously used password.' },
        ])
      }
    }
    const hashed = hashPassword(newPassword)
    this.db.run('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [hashed, new Date().toISOString(), user.id])
    const actor = { id: user.id, username: user.username, sessionRef: this.current?.sessionRef ?? null, deviceName: deviceName ?? this.current?.deviceName ?? null }
    this.auditPasswordChange({ ...user, password_hash: hashed }, actor, 'Password changed by user')
    const revoked = this.revokeAllSessions(user.id, true)
    if (revoked) {
      this.current = this.createSession(user.id, { deviceName: this.current?.deviceName }, 'password')
    }
  }

  logoutAll(): void {
    const me = this.requireUser()
    this.revokeAllSessions(me.id)
    this.clearPersistedSession()
    this.current = null
    this.lockState.locked = false
  }

  sessionsForUser(userId: string): UserSessionInfo[] {
    const rows = this.db.all<Record<string, unknown>>(
      'SELECT * FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [userId],
    )
    return rows.map((r) => ({
      id: String(r.id),
      sessionRef: String(r.session_ref),
      createdAt: String(r.created_at),
      lastSeenAt: String(r.last_seen_at),
      expiresAt: new Date(Number(r.expires_at)).toISOString(),
      revokedAt: (r.revoked_at as string) ?? null,
      revokedReason: (r.revoked_reason as string) ?? null,
      deviceName: String(r.device_name),
      ip: String(r.ip),
      authMethod: String(r.auth_method),
      current: this.current?.id === r.id && !this.lockState.locked,
    }))
  }

  loginHistory(userId: string): LoginHistoryEntry[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT id, event_type, created_at, device_name, session_ref, detail, actor_username FROM audit_logs
         WHERE actor_id = ? AND event_type IN ('USER_LOGIN','USER_LOGOUT','FAILED_LOGIN','PASSWORD_CHANGED','SESSION_REVOKED','VAULT_LOCKED','VAULT_UNLOCKED')
         ORDER BY seq DESC LIMIT ?`,
        [userId, MAX_STORED_HISTORY],
      )
      .map((r) => ({
        id: String(r.id),
        eventType: String(r.event_type),
        createdAt: String(r.created_at),
        deviceName: (r.device_name as string) ?? null,
        sessionRef: (r.session_ref as string) ?? null,
        detail: (r.detail as string) ?? null,
        actorUsername: String(r.actor_username),
      }))
  }

  equalSecret(a: string, b: string): boolean {
    return safeEqual(a, b)
  }
}
