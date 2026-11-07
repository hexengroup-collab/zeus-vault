export function bytes(size: number): string {
  if (!Number.isFinite(size)) return ' - '
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** Deterministic hue from a string - used for generated avatars. */
export function nameHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % 360
}

/** Default avatar: red-on-dark monogram SVG (no external assets). */
export function defaultAvatar(name: string): string {
  const hue = nameHue(name)
  const bg = `hsl(${hue} 28% 16%)`
  const ring = `hsl(${hue} 45% 38%)`
  const fg = '#F2F2F0'
  const ini = initials(name)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="${bg}"/><rect x="10" y="10" width="236" height="236" fill="none" stroke="${ring}" stroke-width="4"/><circle cx="128" cy="128" r="78" fill="none" stroke="${ring}" stroke-width="2" stroke-dasharray="4 6" opacity="0.7"/><text x="128" y="152" font-family="'IBM Plex Mono',monospace" font-size="84" font-weight="600" fill="${fg}" text-anchor="middle">${ini}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function ageFromDob(dob: string): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1
  return age >= 0 && age < 130 ? age : null
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; entropy: number } {
  if (!pw) return { score: 0, label: 'Very weak', entropy: 0 }
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33
  let entropy = pw.length * Math.log2(Math.max(pool, 2))
  const unique = new Set(pw).size
  if (unique <= 2) entropy *= 0.4
  else if (unique <= 4) entropy *= 0.7
  if (/(012|123|234|345|456|567|678|789|abc|qwe|password)/i.test(pw)) entropy *= 0.5
  let score: 0 | 1 | 2 | 3 | 4 = 0
  if (entropy >= 100) score = 4
  else if (entropy >= 75) score = 3
  else if (entropy >= 55) score = 2
  else if (entropy >= 35) score = 1
  const label = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'][score]
  return { score, label, entropy: Math.round(entropy) }
}

export function generatePasswordLocal(length = 20): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*-_=+?'
  const all = upper + lower + digits + symbols
  const rnd = (n: number) => {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] % n
  }
  const chars = [upper[rnd(upper.length)], lower[rnd(lower.length)], digits[rnd(digits.length)], symbols[rnd(symbols.length)]]
  while (chars.length < length) chars.push(all[rnd(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
