// Creates a timestamped safety copy of the live vault, then hard-deletes all demo rows.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
const ROOT = 'C:/Users/LENOVO/AppData/Roaming/Zeus Vault/vault-data'
const EXPORTS = path.join(ROOT, 'exports')
fs.mkdirSync(EXPORTS, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const target = path.join(EXPORTS, `predemopurge-${stamp}.db`)
{
  const src = new DatabaseSync(path.join(ROOT, 'vault.db'))
  src.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  src.close()
  console.log('backup written:', target, fs.statSync(target).size, 'bytes')
}
{
  const db = new DatabaseSync(path.join(ROOT, 'vault.db'))
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('BEGIN IMMEDIATE')
  try {
    const demoIds = db.prepare('SELECT id FROM profiles WHERE is_demo = 1').all().map((r) => r.id)
    console.log('demo profiles:', demoIds.length)
    if (demoIds.length) {
      const placeholders = demoIds.map(() => '?').join(',')
      for (const table of ['profiles_fts']) {
        const hasCol = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = 'profile_id'`).get()
        if (hasCol) db.prepare(`DELETE FROM ${table} WHERE profile_id IN (${placeholders})`).run(...demoIds)
      }
      db.prepare(`DELETE FROM profiles WHERE id IN (${placeholders})`).run(...demoIds)
    }
    const demoB2b = db.prepare('DELETE FROM b2b_contacts WHERE is_demo = 1').run()
    console.log('demo b2b contacts deleted:', demoB2b.changes)
    db.prepare("INSERT OR REPLACE INTO application_settings(key, value, updated_at, updated_by) VALUES ('vault.demo_seeded','false',?, 'system')").run(new Date().toISOString())
    console.log('remaining profiles:', db.prepare('SELECT count(*) c FROM profiles').get().c)
    console.log('remaining b2b contacts:', db.prepare('SELECT count(*) c FROM b2b_contacts').get().c)
    console.log('audit rows preserved:', db.prepare('SELECT count(*) c FROM audit_logs').get().c)
    db.exec('COMMIT')
    console.log('purge complete')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  db.close()
}
process.exit(0)
