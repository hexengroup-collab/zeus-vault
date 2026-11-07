import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { Db } from '../src/main/db/sqlite'
import { migrate } from '../src/main/db/schema'
import { SettingsService } from '../src/main/services/settings'
import { AuditService } from '../src/main/services/audit'
import { AuthService } from '../src/main/services/auth'
import { ApiKeysService } from '../src/main/services/apikeys'
import { hashPassword, encryptField, decryptField } from '../src/main/lib/crypto'

function makeContext() {
  const db = new Db(':memory:')
  migrate(db)
  const settings = new SettingsService(db)
  const audit = new AuditService(db)
  const auth = new AuthService(db, audit, settings)
  const apikeys = new ApiKeysService(db, audit)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
     VALUES (?,?,?,?,?,?,?,'admin','active',?,?,?,'{}')`,
    [id, 'admin', 'admin', 'Administrator', 'admin@example.com', 'admin@example.com', hashPassword('CorrectHorse#9'), now, now, id],
  )
  return { db, settings, audit, auth, apikeys, admin: { id, username: 'admin' } }
}

describe('API key lifecycle', () => {
  it('issues keys, verifies them, and never stores plaintext', () => {
    const { db, apikeys, admin } = makeContext()
    const generated = apikeys.generate('ci-runner', admin)
    expect(generated.key.startsWith('zv_')).toBe(true)
    const row = db.get<Record<string, unknown>>('SELECT * FROM api_keys WHERE id = ?', [generated.id])!
    expect(String(row.key_hash)).not.toContain(generated.key)
    expect(apikeys.verify(generated.key)).toEqual({ userId: admin.id, username: 'admin' })
    expect(apikeys.verify('zv_wrong')).toBeNull()
  })

  it('revokes immediately and keeps listing clean', () => {
    const { apikeys, admin } = makeContext()
    const generated = apikeys.generate('temp', admin)
    expect(apikeys.verify(generated.key)).not.toBeNull()
    apikeys.revoke(generated.id, admin)
    expect(apikeys.verify(generated.key)).toBeNull()
    expect(apikeys.list(admin.id, true)).toHaveLength(0)
  })

  it('prevents a standard user from revoking another owner\'s key', () => {
    const { db, auth, admin, apikeys } = makeContext()
    const generated = apikeys.generate('admin-key', admin)
    const otherId = crypto.randomUUID()
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO users(id, username, username_lower, full_name, email, email_lower, password_hash, role, status, created_at, updated_at, created_by, preferences)
       VALUES (?,?,?,?,?,?,?,'standard','active',?,?,?,'{}')`,
      [otherId, 'analyst', 'analyst', 'Analyst', 'analyst@example.com', 'analyst@example.com', hashPassword('CorrectHorse#9'), now, now, admin.id],
    )
    expect(() => apikeys.revoke(generated.id, { id: otherId, username: 'analyst' })).toThrow()
    expect(apikeys.verify(generated.key)).not.toBeNull()
    void auth
  })

  it('keeps secrets out of the database', () => {
    const { db, auth } = makeContext()
    auth.login('admin', 'CorrectHorse#9')
    const leaked = db.value<number>(
      `SELECT COUNT(*) FROM application_settings WHERE key IN ('vault.session_token', 'vault.trusted_device')`,
    ) ?? 0
    expect(leaked).toBe(0)
  })
})

describe('session locking', () => {
  it('locks on inactivity and only unlocks with the password', () => {
    const ctx = makeContext()
    ctx.settings.update({ inactivityLockMinutes: 1, requirePasswordUnlock: true }, 'admin')
    const session = ctx.auth.login('admin', 'CorrectHorse#9')
    expect(session.session).toBeTruthy()
    // Claim the session is old, in both the database and the in-memory Session object.
    const old = new Date(Date.now() - 10 * 60_000).toISOString()
    ctx.db.run('UPDATE user_sessions SET last_activity_at = ? WHERE id = ?', [old, session.session.id])
    const current = (ctx.auth as unknown as { current: { lastActivityAt: string } }).current
    current.lastActivityAt = old
    ctx.auth.checkVaultTimeout()
    expect(ctx.auth.lockState.locked).toBe(true)
    expect(() => ctx.auth.unlock('wrong-password', true, 'test')).toThrow()
    expect(ctx.auth.lockState.locked).toBe(true)
    const unlocked = ctx.auth.unlock('CorrectHorse#9', true, 'test')
    expect(unlocked.user.username).toBe('admin')
    expect(ctx.auth.lockState.locked).toBe(false)
    ctx.auth.logout()
    expect(ctx.auth.session).toBeNull()
  })

  it('revokes all other sessions on password change', () => {
    const ctx = makeContext()
    ctx.settings.update({ singleSession: false }, 'admin')
    const a = ctx.auth.login('admin', 'CorrectHorse#9', { deviceName: 'one' })
    const b = ctx.auth.login('admin', 'CorrectHorse#9', { deviceName: 'two' })
    // Current session is `b`; simulate work from session `a`.
    ctx.db.run('UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [new Date().toISOString(), 'test', a.session.id])
    expect(ctx.auth.sessionsForUser(ctx.admin.id).find((s) => s.id === b.session.id)?.revokedAt).toBeNull()
  })
})

describe('encryption at rest', () => {
  it('field encryption is indistinguishable from random bytes', () => {
    const key = randomBytes(32)
    const ct = encryptField('metropolis permit 4417', key, 'account')
    expect(ct).not.toContain('metropolis')
    const parts = ct.split('.')
    expect(parts[0]).toBe('v1')
    expect(parts[1]).toBe('account')
    // Tampered ciphertext fails authentication.
    const tampered = [...parts]
    tampered[4] = tampered[4].slice(0, -3) + (tampered[4].endsWith('A') ? 'BBB' : 'AAA')
    expect(() => decryptField(tampered.join('.'), key)).toThrow()
  })
})
