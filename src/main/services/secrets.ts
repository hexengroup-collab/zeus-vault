import fs from 'node:fs'
import path from 'node:path'

/**
 * Storage for session and trusted-device secrets.
 * Raw tokens never live inside the vault database. This store keeps them in a
 * small file somewhere the database file alone is useless without; the
 * implementation in AppContext encrypts the file contents with the vault
 * field key, so neither artifact is sufficient on its own.
 */
export interface SecretStore {
  get(key: string): string | null
  set(key: string, value: string): void
  delete(key: string): void
}

export class InMemorySecretStore implements SecretStore {
  private data = new Map<string, string>()
  get(key: string): string | null {
    return this.data.get(key) ?? null
  }
  set(key: string, value: string): void {
    this.data.set(key, value)
  }
  delete(key: string): void {
    this.data.delete(key)
  }
}

export class FileSecretStore implements SecretStore {
  constructor(private readonly filePath: string) {}

  private load(): Record<string, string> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private write(data: Record<string, string>): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
      fs.renameSync(tmp, this.filePath)
    } catch {
      /* non-fatal: the session simply will not be restored */
    }
  }

  get(key: string): string | null {
    return this.load()[key] ?? null
  }
  set(key: string, value: string): void {
    const data = this.load()
    data[key] = value
    this.write(data)
  }
  delete(key: string): void {
    const data = this.load()
    if (data[key] === undefined) return
    delete data[key]
    this.write(data)
  }
}
