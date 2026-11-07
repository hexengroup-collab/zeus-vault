import type { Db } from '../db/sqlite'
import type { ApiKeyListItem } from '../../shared/types'
import { AppError, assertFound } from '../lib/errors'
import { randomHex, sha256Hex, safeEqual } from '../lib/crypto'
import type { AuditService, Actor } from './audit'

export interface GeneratedApiKey {
  id: string
  key: string
  hint: string
  label: string
  createdAt: string
}

export class ApiKeysService {
  constructor(
    private db: Db,
    private audit: AuditService,
  ) {}

  private rowToItem(r: Record<string, unknown>): ApiKeyListItem {
    return {
      id: String(r.id),
      label: String(r.label ?? ''),
      hint: String(r.hint ?? ''),
      createdAt: String(r.created_at),
      lastUsedAt: (r.last_used_at as string) ?? null,
      ownerUsername: String(r.owner_username ?? ''),
    }
  }

  generate(label: string | null | undefined, actor: Actor): GeneratedApiKey {
    const userId = actor.id
    if (!userId) throw new AppError('UNAUTHENTICATED', 'Authentication required.')
    const key = `zv_${randomHex(24)}`
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const cleanLabel = (label ?? '').trim().slice(0, 80)
    this.db.run('INSERT INTO api_keys(id, key_hash, hint, label, owner_user_id, owner_username, created_at) VALUES (?,?,?,?,?,?,?)', [
      id, sha256Hex(key), key.slice(-4), cleanLabel, userId, actor.username, now,
    ])
    this.audit.record(actor, { eventType: 'APIKEY_CREATED', targetType: 'system', targetId: id, targetLabel: `API key ${key.slice(0, 8)}…${key.slice(-4)}`, detail: cleanLabel || 'unnamed key' })
    return { id, key, hint: key.slice(-4), label: cleanLabel, createdAt: now }
  }

  list(ownerUserId: string | null, isAdmin: boolean): ApiKeyListItem[] {
    if (isAdmin) {
      return this.db.all<Record<string, unknown>>(
        'SELECT * FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC',
      ).map((r) => this.rowToItem(r))
    }
    return this.db.all<Record<string, unknown>>(
      'SELECT * FROM api_keys WHERE owner_user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
      [ownerUserId],
    ).map((r) => this.rowToItem(r))
  }

  revoke(id: string, actor: Actor): void {
    const row = assertFound(
      this.db.get<Record<string, unknown>>('SELECT * FROM api_keys WHERE id = ? AND revoked_at IS NULL', [id]),
      'API key',
    )
    if (String(row.owner_user_id) !== actor.id) {
      const actorRole = this.db.value<string>('SELECT role FROM users WHERE id = ?', [actor.id])
      if (actorRole !== 'admin') throw new AppError('FORBIDDEN', 'You can only revoke your own keys.')
    }
    this.db.run('UPDATE api_keys SET revoked_at = ? WHERE id = ?', [new Date().toISOString(), id])
    this.audit.record(actor, { eventType: 'APIKEY_REVOKED', targetType: 'system', targetId: id, targetLabel: `API key ${String(row.hint)}`, detail: 'Key revoked' })
  }

  verify(plain: string): { userId: string; username: string } | null {
    if (!plain) return null
    const hash = sha256Hex(plain)
    const rows = this.db.all<Record<string, unknown>>(
      'SELECT id, key_hash, owner_user_id, owner_username FROM api_keys WHERE revoked_at IS NULL',
    )
    for (const r of rows) {
      if (safeEqual(String(r.key_hash), hash)) {
        this.db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), String(r.id)])
        return { userId: String(r.owner_user_id), username: String(r.owner_username) }
      }
    }
    return null
  }
}
