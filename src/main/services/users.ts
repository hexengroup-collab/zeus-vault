import type { Db } from '../db/sqlite'
import type { Role, UserRecord, UserSessionInfo, LoginHistoryEntry } from '../../shared/types'
import { AppError, assertFound, validationError } from '../lib/errors'
import { hashPassword, validatePassword } from '../lib/crypto'
import type { AuditService, Actor } from './audit'
import type { AuthService } from './auth'
import type { SettingsService } from './settings'

export interface CreateUserInput {
  fullName: string
  username: string
  email: string
  password: string
  role: Role
}

export interface UpdateUserInput {
  fullName?: string
  username?: string
  email?: string
  role?: Role
  status?: 'active' | 'suspended'
}

export class UsersService {
  constructor(
    private db: Db,
    private audit: AuditService,
    private settings: SettingsService,
    private auth: AuthService,
  ) {}

  list(): UserRecord[] {
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT u.*, (SELECT COUNT(*) FROM profiles p WHERE p.created_by_user_id = u.id AND p.deleted_at IS NULL) AS profile_count,
              EXISTS(SELECT 1 FROM user_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS session_active
       FROM users u ORDER BY u.created_at ASC`,
      [Date.now()],
    )
    return rows.map((r) => ({
      id: String(r.id),
      username: String(r.username),
      fullName: String(r.full_name),
      email: String(r.email),
      role: r.role as Role,
      avatar: (r.avatar_blob as string) || null,
      status: r.status as UserRecord['status'],
      createdAt: String(r.created_at),
      lastLogin: (r.last_login as string) ?? null,
      lastActivity: (r.last_activity as string) ?? null,
      mustChangePassword: Number(r.must_change_password) === 1,
      sessionActive: Number(r.session_active) === 1,
      profileCount: Number(r.profile_count),
    }))
  }

  create(input: CreateUserInput, actor: Actor): UserRecord {
    const s = this.settings.get()
    const fields: { field: string; message: string }[] = []
    const username = input.username.trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) fields.push({ field: 'username', message: 'Username: 3-40 chars, letters, digits, dot, underscore, hyphen.' })
    if (!input.fullName.trim()) fields.push({ field: 'fullName', message: 'Full name is required.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) fields.push({ field: 'email', message: 'Enter a valid email address.' })
    const pwErr = validatePassword(input.password, { minLength: s.passwordMinLength, requireUpper: s.requireUpper, requireNumber: s.requireNumber, requireSymbol: s.requireSymbol })
    if (pwErr) fields.push({ field: 'password', message: pwErr })
    if (fields.length) validationError(fields)
    const dup = this.db.value<number>('SELECT COUNT(*) FROM users WHERE username_lower = ? OR email_lower = ?', [username, input.email.trim().toLowerCase()])
    if (dup) throw new AppError('VALIDATION', 'A user with that username or email already exists.', [{ field: 'username', message: 'Username or email already in use.' }])

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, input.username.trim(), username, input.fullName.trim(), input.email.trim(), input.email.trim().toLowerCase(), hashPassword(input.password), input.role, 'active', now, now, actor.id, '{}'],
    )
    this.audit.record(actor, { eventType: 'USER_CREATED', targetType: 'user', targetId: id, targetLabel: input.username.trim(), detail: `Role ${input.role}` })
    return this.list().find((u) => u.id === id)!
  }

  update(id: string, patch: UpdateUserInput, actor: Actor): UserRecord {
    const u = assertFound(this.db.get<{ id: string; username: string }>('SELECT id, username FROM users WHERE id = ?', [id]), 'User')
    if (patch.username) {
      const uname = patch.username.trim().toLowerCase()
      if (!/^[a-z0-9._-]{3,40}$/.test(uname)) validationError([{ field: 'username', message: 'Username: 3-40 chars, letters, digits, dot, underscore, hyphen.' }])
      const dup = this.db.value<number>('SELECT COUNT(*) FROM users WHERE username_lower = ? AND id <> ?', [uname, id])
      if (dup) validationError([{ field: 'username', message: 'Username already in use.' }])
      this.db.run('UPDATE users SET username = ?, username_lower = ?, updated_at = ? WHERE id = ?', [patch.username.trim(), uname, new Date().toISOString(), id])
    }
    if (patch.email) {
      const email = patch.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) validationError([{ field: 'email', message: 'Enter a valid email address.' }])
      const dup = this.db.value<number>('SELECT COUNT(*) FROM users WHERE email_lower = ? AND id <> ?', [email, id])
      if (dup) validationError([{ field: 'email', message: 'Email already in use.' }])
      this.db.run('UPDATE users SET email = ?, email_lower = ?, updated_at = ? WHERE id = ?', [patch.email.trim(), email, new Date().toISOString(), id])
    }
    if (patch.fullName) this.db.run('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?', [patch.fullName.trim(), new Date().toISOString(), id])
    if (patch.role) this.db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [patch.role, new Date().toISOString(), id])
    if (patch.status) {
      this.db.run(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`, [patch.status, new Date().toISOString(), id])
      if (patch.status === 'suspended') {
        this.auth.revokeAllSessions(id)
        this.audit.record(actor, { eventType: 'USER_SUSPENDED', targetType: 'user', targetId: id, targetLabel: u.username })
      }
    }
    this.audit.record(actor, { eventType: 'USER_UPDATED', targetType: 'user', targetId: id, targetLabel: u.username, detail: `Updated: ${Object.keys(patch).join(', ')}` })
    return this.list().find((x) => x.id === id)!
  }

  resetPassword(id: string, newPassword: string, actor: Actor): void {
    const s = this.settings.get()
    const u = assertFound(this.db.get<{ id: string; username: string }>('SELECT id, username FROM users WHERE id = ?', [id]), 'User')
    if (id === actor.id) throw new AppError('VALIDATION', 'Use My Account to change your own password.')
    const err = validatePassword(newPassword, { minLength: s.passwordMinLength, requireUpper: s.requireUpper, requireNumber: s.requireNumber, requireSymbol: s.requireSymbol })
    if (err) validationError([{ field: 'password', message: err }])
    this.db.run('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?', [hashPassword(newPassword), new Date().toISOString(), id])
    this.auth.revokeAllSessions(id)
    this.audit.record(actor, { eventType: 'PASSWORD_CHANGED', targetType: 'user', targetId: id, targetLabel: u.username, detail: 'Password reset by administrator' })
  }

  sessions(userId: string): UserSessionInfo[] {
    return this.auth.sessionsForUser(userId)
  }

  revokeSessions(userId: string, actor: Actor): number {
    const n = this.auth.revokeAllSessions(userId)
    this.audit.record(actor, { eventType: 'SESSION_REVOKED', targetType: 'user', targetId: userId, detail: `Administrator revoked ${n} session(s)` })
    return n
  }

  loginHistory(userId: string): LoginHistoryEntry[] {
    return this.auth.loginHistory(userId)
  }

  sessionsAndHistoryFor(userId: string) {
    return { sessions: this.sessions(userId), history: this.loginHistory(userId) }
  }
}
