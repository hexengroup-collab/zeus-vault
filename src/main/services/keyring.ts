import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import os from 'node:os'

export type KeyProtection = 'system' | 'password'

export interface KeyFile {
  version: 2
  protection: KeyProtection
  /** entropy mixed into the wrapping key, stored beside the ciphertext */
  salt: string
  nonce: string
  tag: string
  wrapped: string
  fingerprint: number
  keychainRef: string | null
  createdAt: string
}

export function wrapMaster(master: Buffer, wrapKey: Buffer, protection: KeyProtection, keychainRef: string | null): KeyFile {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', wrapKey, nonce)
  cipher.setAAD(Buffer.from('zeus-vault-keywrap-v2'))
  const wrapped = Buffer.concat([cipher.update(master), cipher.final()])
  return {
    version: 2,
    protection,
    salt: randomBytes(16).toString('hex'),
    nonce: nonce.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    wrapped: wrapped.toString('base64url'),
    fingerprint: 0,
    keychainRef,
    createdAt: new Date().toISOString(),
  }
}

export function unwrapMaster(file: KeyFile, wrapKey: Buffer): Buffer {
  const nonce = Buffer.from(file.nonce, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', wrapKey, nonce)
  decipher.setAAD(Buffer.from('zeus-vault-keywrap-v2'))
  decipher.setAuthTag(Buffer.from(file.tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(file.wrapped, 'base64url')), decipher.final()])
}

export function osReference(): string {
  return `zeus-vault/${process.platform}/${os.hostname().slice(0, 24)}/master`
}
