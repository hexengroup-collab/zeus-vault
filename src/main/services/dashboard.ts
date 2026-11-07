import type { Db } from '../db/sqlite'
import type { ActivityItem, DashboardData, ProfileListItem } from '../../shared/types'
import { mapListRow } from './profiles'

const LIST_SQL = `
  SELECT p.id, p.profile_code, p.full_name, p.username, p.country, p.country_iso2, p.city, p.state,
         p.gender, p.dob, p.avatar_blob, p.status, p.is_demo, p.view_count,
         p.created_by, p.created_at, p.updated_at, p.category_id,
         cu.username AS created_by_username, uu.username AS updated_by_username,
         cat.name AS category_name, cat.color AS category_color,
         pc.primary_phone, pc.primary_email,
         EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = p.id AND f.user_id = ?) AS is_favorite,
         (SELECT viewed_at FROM profile_views pv WHERE pv.profile_id = p.id ORDER BY viewed_at DESC LIMIT 1) AS last_viewed_at
  FROM profiles p
  LEFT JOIN profile_categories cat ON cat.id = p.category_id
  LEFT JOIN profile_contacts pc ON pc.profile_id = p.id
  LEFT JOIN profile_accounts pa ON pa.profile_id = p.id
  LEFT JOIN users cu ON cu.id = p.created_by_user_id
  LEFT JOIN users uu ON uu.id = p.updated_by_user_id
  WHERE p.deleted_at IS NULL`

export class DashboardService {
  constructor(private db: Db) {}

  private rows(sql: string, params: (string | number)[], limit: number, userId: string): ProfileListItem[] {
    return this.db.all<Record<string, unknown>>(`${LIST_SQL} ${sql} LIMIT ?`, [userId, ...params, limit]).map((r) =>
      mapListRow(r as never),
    )
  }

  overview(userId: string): DashboardData {
    const value = <T>(sql: string, params: (string | number)[] = []): T => {
      const v = this.db.value<T>(sql, params)
      return (v ?? 0) as T
    }
    const totalProfiles = Number(value(`SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL`))
    const activeProfiles = Number(value(`SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND status = 'active'`))
    const archivedProfiles = totalProfiles - activeProfiles
    const totalCountries = Number(value(`SELECT COUNT(DISTINCT country_iso2) FROM profiles WHERE deleted_at IS NULL AND country_iso2 <> ''`))
    const recentlyCreated = Number(value(`SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND created_at >= datetime('now','-30 days')`))
    const recentlyUpdated = Number(value(`SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND updated_at >= datetime('now','-30 days')`))
    const createdPrev = Number(value(`SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND created_at < datetime('now','-30 days') AND created_at >= datetime('now','-60 days')`))
    const createdThis = Number(value(`SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND created_at >= datetime('now','-30 days')`))
    const totalUsers = Number(value(`SELECT COUNT(*) FROM users`))
    const activeSessions = Number(value(`SELECT COUNT(*) FROM user_sessions WHERE revoked_at IS NULL AND expires_at > ?`, [Date.now()]))

    const recentProfiles = this.rows(`ORDER BY p.updated_at DESC`, [], 6, userId)
    const recentlyCreatedRows = this.rows(`ORDER BY p.created_at DESC`, [], 6, userId)
    const recentlyModifiedRows = this.rows(`ORDER BY p.updated_at DESC`, [], 6, userId)
    const recentlyViewed = this.rows(
      `AND EXISTS(SELECT 1 FROM profile_views pv WHERE pv.profile_id = p.id) ORDER BY (SELECT MAX(viewed_at) FROM profile_views pv WHERE pv.profile_id = p.id) DESC`,
      [],
      6,
      userId,
    )
    const mostViewed = this.rows(`AND p.view_count > 0 ORDER BY p.view_count DESC`, [], 6, userId)

    const countryDistribution = this.db.all<{ country: string; iso2: string; count: number }>(
      `SELECT country, country_iso2 AS iso2, COUNT(*) AS count FROM profiles WHERE deleted_at IS NULL AND country_iso2 <> '' GROUP BY country_iso2, country ORDER BY count DESC LIMIT 8`,
    ).map((r) => ({ country: r.country, iso2: r.iso2, count: Number(r.count) }))

    const categoryDistribution = this.db.all<{ category: string; color: string; count: number }>(
      `SELECT COALESCE(cat.name,'Uncategorized') AS category, COALESCE(cat.color,'#555B65') AS color, COUNT(*) AS count
       FROM profiles p LEFT JOIN profile_categories cat ON cat.id = p.category_id
       WHERE p.deleted_at IS NULL GROUP BY cat.name, cat.color ORDER BY count DESC LIMIT 8`,
    ).map((r) => ({ category: r.category, color: r.color, count: Number(r.count) }))

    const latestActivity: ActivityItem[] = this.db.all<Record<string, unknown>>(
      `SELECT id, event_type, actor_username, target_id, detail, target_label, created_at FROM audit_logs ORDER BY seq DESC LIMIT 9`,
    ).map((r) => ({
      id: String(r.id),
      eventType: String(r.event_type),
      actorUsername: String(r.actor_username),
      targetId: (r.target_id as string) ?? null,
      summary: [String(r.actor_username), humanize(String(r.event_type)), r.target_label ? `· ${String(r.target_label)}` : r.detail ? `· ${String(r.detail)}` : ''].join(' '),
      createdAt: String(r.created_at),
    }))

    return {
      stats: { totalProfiles, activeProfiles, archivedProfiles, totalCountries, recentlyCreated, recentlyUpdated, totalUsers, activeSessions },
      recentProfiles,
      recentlyCreated: recentlyCreatedRows,
      recentlyModified: recentlyModifiedRows,
      recentlyViewed,
      mostViewed,
      countryDistribution,
      categoryDistribution,
      latestActivity,
      totalProfilesDelta: createdThis - createdPrev,
    }
  }
}

function humanize(eventType: string): string {
  const map: Record<string, string> = {
    PROFILE_CREATED: 'created profile',
    PROFILE_UPDATED: 'updated profile',
    FIELD_UPDATED: 'edited field',
    PROFILE_ARCHIVED: 'archived profile',
    PROFILE_RESTORED: 'restored profile',
    PROFILE_DELETED: 'deleted profile',
    PROFILE_EXPORTED: 'exported profile',
    PROFILE_VIEWED: 'viewed profile',
    PROFILE_DUPLICATED: 'duplicated profile',
    PROFILE_IMAGE_CHANGED: 'changed photograph',
    PROFILE_FAVORITED: 'favorited profile',
    PROFILE_UNFAVORITED: 'unfavorited profile',
    USER_LOGIN: 'signed in',
    USER_LOGOUT: 'signed out',
    FAILED_LOGIN: 'failed sign-in',
    PASSWORD_CHANGED: 'changed password',
    ACCOUNT_UPDATED: 'updated account',
    SESSION_REVOKED: 'revoked session',
    VAULT_LOCKED: 'locked vault',
    VAULT_UNLOCKED: 'unlocked vault',
    USER_CREATED: 'created user',
    USER_UPDATED: 'updated user',
    CATEGORY_CREATED: 'created category',
    CATEGORY_UPDATED: 'updated category',
    CATEGORY_DELETED: 'deleted category',
    IMPORT_COMPLETED: 'completed import',
    EXPORT_COMPLETED: 'completed export',
    BACKUP_CREATED: 'created backup',
    BACKUP_RESTORED: 'restored backup',
    SETTINGS_UPDATED: 'updated settings',
    USER_EDITED: 'edited user',
  }
  return map[eventType] ?? eventType.replace(/_/g, ' ').toLowerCase()
}
