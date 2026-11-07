const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function toIsoUtc(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (stored.includes('T') && (stored.endsWith('Z') || /[+-]\d\d:\d\d$/.test(stored))) return stored
  const normalized = stored.includes('T') ? stored : stored.replace(' ', 'T')
  return `${normalized.replace(/\.\d+$/, '')}Z`
}

function maybeIso(stored: string): Date {
  const iso = toIsoUtc(stored)!
  const d = new Date(iso)
  if (!Number.isNaN(d.getTime())) return d
  const d2 = new Date(stored)
  return Number.isNaN(d2.getTime()) ? new Date() : d2
}

export function utcParts(stored: string | null | undefined) {
  if (!stored) return null
  const d = maybeIso(stored)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const p3 = (n: number) => String(n).padStart(3, '0')
  return {
    yyyy: String(d.getUTCFullYear()),
    mo: p2(d.getUTCMonth() + 1),
    dd: p2(d.getUTCDate()),
    hh: p2(d.getUTCHours()),
    mi: p2(d.getUTCMinutes()),
    ss: p2(d.getUTCSeconds()),
    ms: p3(d.getUTCMilliseconds()),
    mon: MONTHS[d.getUTCMonth()],
  }
}

/** 2026-11-06 13:30:45 UTC */
export function formatUtc(stored: string | null | undefined): string {
  const t = utcParts(stored)
  return t ? `${t.yyyy}-${t.mo}-${t.dd} ${t.hh}:${t.mi}:${t.ss} UTC` : ' - '
}

/** 06 NOV 2026 / 133045Z */
export function formatMilitary(stored: string | null | undefined): string {
  const t = utcParts(stored)
  return t ? `${t.dd} ${t.mon} ${t.yyyy} / ${t.hh}${t.mi}${t.ss}Z` : ' - '
}

/** 2026-11-06 */
export function formatDateUtc(stored: string | null | undefined): string {
  const t = utcParts(stored)
  return t ? `${t.yyyy}-${t.mo}-${t.dd}` : ' - '
}

/** 06 NOV 2026 */
export function formatDateMilitary(stored: string | null | undefined): string {
  const t = utcParts(stored)
  return t ? `${t.dd} ${t.mon} ${t.yyyy}` : ' - '
}

/** 2026-11-06 1330Z */
export function formatShortUtc(stored: string | null | undefined, withSeconds = false): string {
  const t = utcParts(stored)
  if (!t) return ' - '
  return `${t.yyyy}-${t.mo}-${t.dd} ${t.hh}${t.mi}${withSeconds ? t.ss : ''}Z`
}

/** 06 NOV 2026 / 13:30:45 */
export function formatReadable(stored: string | null | undefined): string {
  const t = utcParts(stored)
  return t ? `${t.dd} ${t.mon} ${t.yyyy} / ${t.hh}:${t.mi}:${t.ss}` : ' - '
}

export type DateTimeStyle = 'utc' | 'military' | 'iso' | 'readable' | 'relative'

export function formatTimestamp(stored: string | null | undefined, style: DateTimeStyle = 'utc'): string {
  if (!stored) return ' - '
  switch (style) {
    case 'military':
      return formatMilitary(stored)
    case 'iso':
      return formatShortUtc(stored)
    case 'readable':
      return formatReadable(stored)
    case 'relative':
      return relativeTime(stored)
    default:
      return formatUtc(stored)
  }
}

export function relativeTime(stored: string | null | undefined, now: number = Date.now()): string {
  if (!stored) return ' - '
  const ms = now - maybeIso(stored).getTime()
  const abs = Math.abs(ms)
  const suffix = ms >= 0 ? 'ago' : 'from now'
  const min = 60_000
  const hour = 3_600_000
  const day = 86_400_000
  if (abs < min) return 'just now'
  if (abs < hour) return `${Math.floor(abs / min)}M ${suffix}`
  if (abs < day) return `${Math.floor(abs / hour)}H ${suffix}`
  if (abs < day * 30) return `${Math.floor(abs / day)}D ${suffix}`
  if (abs < day * 365) return `${Math.floor(abs / (day * 30))}MO ${suffix}`
  return `${Math.floor(abs / (day * 365))}Y ${suffix}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function dbNow(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

export function calculateAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--
  return age >= 0 && age < 130 ? age : null
}

export function addDays(days: number, from: number = Date.now()): number {
  return from + days * 86_400_000
}
