import type { Db } from '../db/sqlite'
import { decryptField } from '../lib/crypto'
import type { IntegrityResult } from '../../shared/types'

export class SecurityService {
  constructor(private db: Db, private fieldKey: Buffer) {}

  integrityCheck(): IntegrityResult {
    const checkedAt = new Date().toISOString()
    let quickCheck = 'unknown'
    try {
      quickCheck = String(this.db.value<string>('PRAGMA quick_check') ?? 'unknown')
    } catch (e) {
      quickCheck = `error: ${(e as Error).message}`
    }

    let foreignKeyErrors = 0
    let orphanRows = 0
    try {
      const fk = this.db.all<Record<string, unknown>>('PRAGMA foreign_key_check')
      foreignKeyErrors = fk.length
      orphanRows = fk.length
    } catch {
      foreignKeyErrors = -1
    }

    const encryptedRows = this.db.all<{ v: string | null }>(
      `SELECT password_enc AS v FROM profile_accounts WHERE password_enc <> ''
       UNION ALL SELECT recovery_enc AS v FROM profile_accounts WHERE recovery_enc <> ''
       UNION ALL SELECT value AS v FROM profile_custom_fields WHERE value_enc = 1`,
    )
    let encryptedFailures = 0
    for (const row of encryptedRows.slice(0, 5000)) {
      if (!row.v) continue
      try {
        decryptField(row.v, this.fieldKey)
      } catch {
        encryptedFailures += 1
      }
    }

    const duplicateCodes = Number(
      this.db.value<number>('SELECT COUNT(*) FROM (SELECT profile_code FROM profiles GROUP BY profile_code HAVING COUNT(*) > 1)') ?? 0,
    )

    const ok = quickCheck === 'ok' && foreignKeyErrors === 0 && encryptedFailures === 0 && duplicateCodes === 0
    return {
      ok,
      quickCheck,
      foreignKeyErrors,
      orphanRows,
      encryptedFields: encryptedRows.length,
      encryptedFailures,
      duplicateCodes,
      checkedAt,
    }
  }
}
