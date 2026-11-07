import { createHash } from 'node:crypto'
import type { AuditEntry, SessionUser } from '../../shared/types'
import type { Db } from '../db/sqlite'

export interface Actor {
  id: string | null
  username: string
  sessionRef?: string | null
  deviceName?: string | null
}

export interface AuditEvent {
  eventType: string
  targetType?: 'profile' | 'user' | 'system' | 'category' | 'settings' | 'session' | 'search' | 'b2b'
  targetId?: string | null
  targetLabel?: string | null
  field?: string | null
  oldValue?: string | null
  newValue?: string | null
  detail?: string | null
}

export function actorFrom(user: SessionUser | null, sessionRef?: string | null, deviceName?: string | null): Actor {
  return { id: user?.id ?? null, username: user?.username ?? 'system', sessionRef: sessionRef ?? null, deviceName: deviceName ?? null }
}

const SENSITIVE_FIELD = /password|recovery|secret|token/i

function previousHash(db: Db): string {
  return db.value<string>('SELECT entry_hash FROM audit_logs ORDER BY seq DESC LIMIT 1') ?? ''
}

export class AuditService {
  constructor(private db: Db) {}

  record(actor: Actor, event: AuditEvent): void {
    this.write(actor, event)
  }

  recordMany(actor: Actor, events: AuditEvent[]): void {
    this.db.transaction(() => {
      for (const e of events) this.write(actor, e)
    })
  }

  private write(actor: Actor, event: AuditEvent): void {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const prev = previousHash(this.db)
    const field = event.field ?? null
    const oldValue = field && SENSITIVE_FIELD.test(field) && event.oldValue ? '[redacted]' : event.oldValue ?? null
    const newValue = field && SENSITIVE_FIELD.test(field) && event.newValue ? '[redacted]' : event.newValue ?? null
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          prev,
          id,
          event.eventType,
          actor.id,
          actor.username,
          event.targetType ?? 'system',
          event.targetId ?? null,
          event.targetLabel ?? null,
          field,
          oldValue,
          newValue,
          event.detail ?? null,
          actor.sessionRef ?? null,
          createdAt,
        ]),
      )
      .digest('hex')
    this.db.run(
      `INSERT INTO audit_logs(seq, id, event_type, actor_id, actor_username, target_type, target_id, target_label, field, old_value, new_value, detail, session_ref, device_name, created_at, previous_hash, entry_hash)
       VALUES ((SELECT COALESCE(MAX(seq),0)+1 FROM audit_logs), ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        event.eventType,
        actor.id,
        actor.username,
        event.targetType ?? 'system',
        event.targetId ?? null,
        event.targetLabel ?? null,
        field,
        oldValue,
        newValue,
        event.detail ?? null,
        actor.sessionRef ?? null,
        actor.deviceName ?? null,
        createdAt,
        prev,
        hash,
      ],
    )
  }

  list(query: {
    page?: number
    pageSize?: number
    eventType?: string
    category?: 'PROFILE' | 'IDENTITY' | 'SYSTEM'
    actorId?: string
    targetId?: string
    search?: string
    from?: string
    to?: string
  }): { rows: AuditEntry[]; total: number } {
    const where: string[] = ['1=1']
    const params: (string | number)[] = []
    if (query.eventType && query.eventType !== 'all') {
      where.push('event_type = ?')
      params.push(query.eventType)
    }
    if (query.category === 'PROFILE') {
      where.push(`(event_type LIKE 'PROFILE_%' OR event_type LIKE 'FIELD_%' OR event_type LIKE 'ATTACHMENT_%')`)
    } else if (query.category === 'IDENTITY') {
      where.push(`event_type IN ('USER_LOGIN','USER_LOGOUT','FAILED_LOGIN','PASSWORD_CHANGED','ACCOUNT_UPDATED','SESSION_REVOKED','VAULT_LOCKED','VAULT_UNLOCKED')`)
    } else if (query.category === 'SYSTEM') {
      where.push(`event_type NOT LIKE 'PROFILE_%' AND event_type NOT LIKE 'FIELD_%' AND event_type NOT LIKE 'ATTACHMENT_%' AND event_type NOT IN ('USER_LOGIN','USER_LOGOUT','FAILED_LOGIN','PASSWORD_CHANGED','ACCOUNT_UPDATED','SESSION_REVOKED','VAULT_LOCKED','VAULT_UNLOCKED')`)
    }
    if (query.actorId) {
      where.push('actor_id = ?')
      params.push(query.actorId)
    }
    if (query.targetId) {
      where.push('target_id = ?')
      params.push(query.targetId)
    }
    if (query.from) {
      where.push('created_at >= ?')
      params.push(query.from)
    }
    if (query.to) {
      where.push('created_at <= ?')
      params.push(`${query.to}T23:59:59.999Z`)
    }
    if (query.search) {
      where.push('(actor_username LIKE ? OR target_label LIKE ? OR detail LIKE ? OR field LIKE ?)')
      const like = `%${query.search}%`
      params.push(like, like, like, like)
    }
    const clause = where.join(' AND ')
    const pageSize = Math.min(200, Math.max(10, query.pageSize ?? 50))
    const page = Math.max(1, query.page ?? 1)
    const total = Number(this.db.value<number>(`SELECT COUNT(*) FROM audit_logs WHERE ${clause}`, params) ?? 0)
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT id, event_type, actor_id, actor_username, target_type, target_id, target_label, field, old_value, new_value, detail, session_ref, device_name, created_at
       FROM audit_logs WHERE ${clause} ORDER BY seq DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    )
    return { rows: rows.map(mapAudit), total }
  }

  verifyChain(): { ok: boolean; checked: number; brokenAt: string | null } {
    const rows = this.db.all<Record<string, unknown>>(
      'SELECT * FROM audit_logs ORDER BY seq ASC',
    )
    let prev = ''
    for (const r of rows) {
      const hash = createHash('sha256')
        .update(
          JSON.stringify([
            prev,
            r.id,
            r.event_type,
            r.actor_id,
            r.actor_username,
            r.target_type,
            r.target_id,
            r.target_label,
            r.field,
            r.old_value,
            r.new_value,
            r.detail,
            r.session_ref,
            r.created_at,
          ]),
        )
        .digest('hex')
      if (hash !== r.entry_hash) {
        return { ok: false, checked: rows.length, brokenAt: String(r.id) }
      }
      prev = hash
    }
    return { ok: true, checked: rows.length, brokenAt: null }
  }
}

export function mapAudit(r: Record<string, unknown>): AuditEntry {
  return {
    id: String(r.id),
    eventType: String(r.event_type),
    actorId: (r.actor_id as string) ?? null,
    actorUsername: String(r.actor_username),
    targetType: String(r.target_type),
    targetId: (r.target_id as string) ?? null,
    targetLabel: (r.target_label as string) ?? null,
    field: (r.field as string) ?? null,
    oldValue: (r.old_value as string) ?? null,
    newValue: (r.new_value as string) ?? null,
    detail: (r.detail as string) ?? null,
    sessionRef: (r.session_ref as string) ?? null,
    deviceName: (r.device_name as string) ?? null,
    createdAt: String(r.created_at),
  }
}
