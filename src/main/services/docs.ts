// Local OCR for image attachments + document text search.
// Tesseract runs fully offline with bundled eng.traineddata.
import path from 'node:path'
import { createRequire } from 'node:module'
import { createWorker, type Worker } from 'tesseract.js'
import { AppError } from '../lib/errors'
import type { Db } from '../db/sqlite'
import type { Actor } from './audit'

const require = createRequire(import.meta.url)

export interface DocStatus {
  queued: number
  processing: number
  done: number
  failed: number
  lastError: string | null
}

function ocrDir(): string {
  try {
    const electron = require('electron') as { app?: { getAppPath: () => string } }
    if (electron.app?.getAppPath) return path.join(electron.app.getAppPath(), 'resources', 'ocr')
  } catch {
    /* not in Electron (tests) */
  }
  const candidates = [
    path.join(__dirname, '..', '..', 'resources', 'ocr'),
    path.join(process.cwd(), 'resources', 'ocr'),
  ]
  for (const c of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('node:fs')
      if (fs.existsSync(path.join(c, 'eng.traineddata'))) return c
    } catch {
      /* keep looking */
    }
  }
  return candidates[0]
}

interface Row {
  attachment_id: string
  profile_id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
}

export class DocsService {
  private worker: Worker | null = null
  private running = false

  constructor(private db: Db) {}

  private async getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = await createWorker('eng', 1, { langPath: ocrDir(), gzip: false, logger: () => {} })
    }
    return this.worker
  }

  enqueue(attachmentId: string, profileId: string): void {
    this.db.run('INSERT OR REPLACE INTO document_text(attachment_id, profile_id, status, updated_at) VALUES (?,?, ?,? ) ON CONFLICT(attachment_id) DO UPDATE SET status=? , updated_at=?', [
      attachmentId,
      profileId,
      'queued',
      new Date().toISOString(),
      'queued',
      new Date().toISOString(),
    ])
    void this.drain()
  }

  enqueueAll(): { queued: number } {
    const rows = this.db.all<{ id: string; profile_id: string }>(`SELECT id, profile_id FROM attachments WHERE mime LIKE 'image/%'`)
    const done = new Set(this.db.all<{ attachment_id: string }>(`SELECT attachment_id FROM document_text WHERE status='done'`).map((r) => r.attachment_id))
    let n = 0
    for (const a of rows) {
      if (done.has(a.id)) continue
      this.enqueue(a.id, a.profile_id)
      n++
    }
    return { queued: n }
  }

  status(actor: Actor): DocStatus {
    void actor
    const rows = this.db.all<{ status: string; c: number }>('SELECT status, COUNT(*) c FROM document_text GROUP BY status')
    const out: DocStatus = { queued: 0, processing: 0, done: 0, failed: 0, lastError: null }
    for (const r of rows) {
      const k = String(r.status) as 'queued' | 'processing' | 'done' | 'failed'
      if (k === 'queued' || k === 'processing' || k === 'done' || k === 'failed') out[k] = Number(r.c)
    }
    out.lastError = this.db.get<{ error: string | null }>(`SELECT error FROM document_text WHERE status='failed' AND error IS NOT NULL ORDER BY updated_at DESC LIMIT 1`)?.error ?? null
    return out
  }

  async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      let row = this.db.get<Row>(`SELECT attachment_id, profile_id, status FROM document_text WHERE status='queued' ORDER BY updated_at ASC LIMIT 1`)
      while (row) {
        this.db.run(`UPDATE document_text SET status='processing', updated_at=? WHERE attachment_id=?`, [new Date().toISOString(), row.attachment_id])
        try {
          const att = this.db.get<{ blob: string }>(`SELECT blob FROM attachments WHERE id=?`, [row.attachment_id])
          if (!att) throw new Error('Attachment no longer exists')
          const worker = await this.getWorker()
          const { data } = await worker.recognize(att.blob)
          this.db.run(`UPDATE document_text SET status='done', text=?, error=NULL, updated_at=? WHERE attachment_id=?`, [
            (data.text ?? '').slice(0, 20000),
            new Date().toISOString(),
            row.attachment_id,
          ])
        } catch (e) {
          this.db.run(`UPDATE document_text SET status='failed', error=?, updated_at=? WHERE attachment_id=?`, [
            e instanceof Error ? e.message.slice(0, 200) : String(e),
            new Date().toISOString(),
            row.attachment_id,
          ])
        }
        await new Promise((r) => setTimeout(r, 25))
        row = this.db.get<Row>(`SELECT attachment_id, profile_id, status FROM document_text WHERE status='queued' ORDER BY updated_at ASC LIMIT 1`)
      }
    } finally {
      this.running = false
    }
  }

  search(text: string): { attachmentId: string; profileId: string; name: string; snippet: string }[] {
    const q = text.trim()
    if (!q) throw new AppError('VALIDATION', 'Provide search text.')
    const rows = this.db.all<{ attachment_id: string; profile_id: string; name: string; text: string }>(
      `SELECT dt.attachment_id, dt.profile_id, a.name, dt.text FROM document_text dt JOIN attachments a ON a.id = dt.attachment_id
       WHERE dt.status='done' AND dt.text LIKE ? ESCAPE '|' ORDER BY dt.updated_at DESC LIMIT 50`,
      [`%${q.replace(/[%_\\|]/g, (c) => `|${c}`)}%`],
    )
    return rows.map((r) => {
      const idx = r.text.toLowerCase().indexOf(q.toLowerCase())
      const snippet = r.text.slice(Math.max(0, idx - 40), idx + q.length + 80).replace(/\s+/g, ' ').trim()
      return { attachmentId: r.attachment_id, profileId: r.profile_id, name: r.name, snippet }
    })
  }
}
