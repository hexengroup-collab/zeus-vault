import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { argon2id } from '@noble/hashes/argon2.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

const VERSION = 1

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function hmacHex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function aadFor(purpose: string): Buffer {
  return Buffer.from(`zeus-vault:v${VERSION}:${purpose}`, 'utf8')
}

export function encryptField(plain: string, key: Buffer, purpose = 'field'): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aadFor(purpose))
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v${VERSION}.${purpose}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`
}

export function decryptField(payload: string, key: Buffer): string {
  if (!payload) return ''
  const parts = payload.split('.')
  if (parts.length !== 5 || parts[0] !== `v${VERSION}`) {
    throw new Error('Malformed ciphertext')
  }
  const [, purpose, ivB64, tagB64, ctB64] = parts
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const ct = Buffer.from(ctB64, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(aadFor(purpose))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`v${VERSION}.`)
}

export function encryptBuffer(buf: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aadFor('payload'))
  const ct = Buffer.concat([cipher.update(buf), cipher.final()])
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct])
}

export function decryptBuffer(payload: Buffer, key: Buffer): Buffer {
  const version = payload[0]
  if (version !== VERSION) throw new Error('Unsupported backup format version')
  const iv = payload.subarray(1, 13)
  const tag = payload.subarray(13, 29)
  const ct = payload.subarray(29)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(aadFor('payload'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

export function deriveWrapKey(passphrase: string, saltHex: string): Buffer {
  const out = blake2b(new TextEncoder().encode(passphrase), {
    dkLen: 32,
    key: Buffer.from(saltHex, 'hex'),
  })
  return Buffer.from(out)
}

export function deriveSubkey(master: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdf(sha256, master, Buffer.alloc(0), new TextEncoder().encode(purpose), 32))
}

export function fingerprintHex(key: Buffer): number {
  return parseInt(sha256Hex(key).slice(0, 8), 16) >>> 0
}

// ---- Argon2id password hashing (RFC 9106 profile baked in) ----

export const ARGON_PARAMS = { t: 3, m: 32 * 1024, p: 1, dkLen: 32 }

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = argon2id(password, salt, ARGON_PARAMS)
  return `$argon2id$v=19$m=${ARGON_PARAMS.m},t=${ARGON_PARAMS.t},p=${ARGON_PARAMS.p}$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$').filter(Boolean)
    if (parts.length !== 5 || parts[0] !== 'argon2id') return false
    const [, , params, saltB64, hashB64] = parts
    const p: Record<string, number> = {}
    for (const pair of params.split(',')) {
      const [k, v] = pair.split('=')
      p[k] = Number(v)
    }
    const salt = Buffer.from(saltB64, 'base64url')
    const expected = Buffer.from(hashB64, 'base64url')
    const actual = Buffer.from(
      argon2id(password, salt, { t: p.t, m: p.m, p: p.p, dkLen: expected.length }),
    )
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// ---- Password policy ----

export interface PasswordPolicy {
  minLength: number
  requireUpper: boolean
  requireNumber: boolean
  requireSymbol: boolean
}

export function validatePassword(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength) return `Password must be at least ${policy.minLength} characters.`
  if (policy.requireUpper && !/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.'
  if (policy.requireNumber && !/[0-9]/.test(password)) return 'Password must contain a number.'
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) return 'Password must contain a symbol.'
  return null
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Excellent'
  entropy: number
}

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: 'Very weak', entropy: 0 }
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^A-Za-z0-9]/.test(password)) pool += 33
  let entropy = password.length * Math.log2(Math.max(pool, 2))
  const unique = new Set(password).size
  if (unique <= 2) entropy *= 0.4
  else if (unique <= 4) entropy *= 0.7
  if (/^(.)\1+$/.test(password) || /(012|123|234|345|456|567|678|789|abc|qwe|asd|password)/i.test(password)) {
    entropy *= 0.5
  }
  let score: PasswordStrength['score'] = 0
  if (entropy >= 100) score = 4
  else if (entropy >= 75) score = 3
  else if (entropy >= 55) score = 2
  else if (entropy >= 35) score = 1
  const label = (['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'] as const)[score]
  return { score, label, entropy: Math.round(entropy) }
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?'

export function generatePassword(length = 20): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*-_=+?'
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < length) chars.push(pick(PASSWORD_ALPHABET))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

function pick(set: string): string {
  return set[randomBytes(1)[0] % set.length]
}

export function maskSecret(value: string): string {
  if (!value) return ''
  return '•'.repeat(Math.min(Math.max(value.length, 8), 24))
}
