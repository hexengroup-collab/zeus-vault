const SENSITIVE = /(pass(word)?|secret|token|hash|cipher|enc|recovery|pwd)/i

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.test(k)) {
      out[k] = '[redacted]'
    } else if (typeof v === 'string' && v.length > 120) {
      out[k] = `${v.slice(0, 120)}…`
    } else {
      out[k] = v
    }
  }
  return out
}

function line(level: string, scope: string, msg: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const m = meta ? ` ${JSON.stringify(redact(meta))}` : ''
  return `[${ts}] ${level} [${scope}] ${msg}${m}`
}

export const log = {
  info(scope: string, msg: string, meta?: Record<string, unknown>) {
    console.log(line('INFO', scope, msg, meta))
  },
  warn(scope: string, msg: string, meta?: Record<string, unknown>) {
    console.warn(line('WARN', scope, msg, meta))
  },
  error(scope: string, msg: string, meta?: Record<string, unknown>) {
    console.error(line('ERROR', scope, msg, meta))
  },
}
