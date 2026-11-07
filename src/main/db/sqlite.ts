import { DatabaseSync } from 'node:sqlite'

export type Row = Record<string, unknown>
export type Param = string | number | bigint | null | Uint8Array

export class SqliteError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'SqliteError'
    this.code = code
  }
}

function isConstraintError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /constraint failed|UNIQUE constraint|FOREIGN KEY constraint/i.test(msg)
}

export class Db {
  readonly raw: DatabaseSync
  readonly path: string
  private txDepth = 0

  constructor(path: string) {
    this.path = path
    this.raw = new DatabaseSync(path)
    this.raw.exec('PRAGMA foreign_keys = ON')
    this.raw.exec('PRAGMA busy_timeout = 5000')
    this.pragma('journal_mode', path === ':memory:' ? 'MEMORY' : 'WAL')
    this.pragma('synchronous', 'NORMAL')
    this.pragma('temp_store', 'MEMORY')
    this.pragma('cache_size', '-32000')
    this.pragma('wal_autocheckpoint', '1000')
  }

  pragma(name: string, value?: string | number): unknown {
    if (value === undefined) {
      return this.raw.prepare(`PRAGMA ${name}`).get()
    }
    this.raw.exec(`PRAGMA ${name} = ${String(value).replace(/[^A-Za-z0-9_-]/g, '')}`)
    return undefined
  }

  run(sql: string, params: Param[] = []): { changes: number; lastInsertRowid: number } {
    try {
      const r = this.raw.prepare(sql).run(...params)
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }
    } catch (e) {
      throw new SqliteError(e instanceof Error ? e.message : String(e), isConstraintError(e) ? 'CONSTRAINT' : undefined)
    }
  }

  all<T = Row>(sql: string, params: Param[] = []): T[] {
    return this.raw.prepare(sql).all(...params) as T[]
  }

  get<T = Row>(sql: string, params: Param[] = []): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined
  }

  value<T = unknown>(sql: string, params: Param[] = []): T | undefined {
    const r = this.get<Row>(sql, params)
    if (!r) return undefined
    const vals = Object.values(r)
    return vals[0] as T
  }

  exec(sql: string): void {
    this.raw.exec(sql)
  }

  transaction<T>(fn: () => T): T {
    if (this.txDepth > 0) return fn()
    this.raw.exec('BEGIN IMMEDIATE')
    this.txDepth++
    try {
      const result = fn()
      this.txDepth--
      this.raw.exec('COMMIT')
      return result
    } catch (e) {
      this.txDepth--
      try {
        this.raw.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw e
    }
  }

  close(): void {
    try {
      this.raw.close()
    } catch {
      /* already closed */
    }
  }

  ftsAvailable(): boolean {
    try {
      this.raw.exec('CREATE VIRTUAL TABLE IF NOT EXISTS __fts_probe USING fts5(x)')
      this.raw.exec('DROP TABLE IF EXISTS __fts_probe')
      return true
    } catch {
      return false
    }
  }
}
