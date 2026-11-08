// Local image tokenization — no network, no model downloads.
// A token is a compact perceptual fingerprint of ANY image (photo of a person,
// an object, a scene, a document): a pHash + aHash + a 4×4×4 color histogram,
// plus — when a face-like region is found — a sub-token for that region.
// Matching is perceptual similarity, never pixel equality.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'

export interface PhotoToken {
  phash: string
  ahash: string
  histogram: number[]
  faceDetected: boolean
  facePhash: string | null
  faceBox: { x: number; y: number; w: number; h: number } | null
  width: number
  height: number
}

export interface PhotoMatch {
  tokenId: string
  profileId: string
  kind: 'avatar' | 'gallery'
  score: number
  phashSim: number
  histSim: number
  faceSim: number | null
  faceDetected: boolean
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('Invalid image data URL')
  return Buffer.from(m[2], 'base64')
}

function dct8(gray: Uint8Array): Float64Array {
  const out = new Float64Array(64)
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          sum += gray[y * 32 + x] * Math.cos(((2 * x + 1) * u * Math.PI) / 64) * Math.cos(((2 * y + 1) * v * Math.PI) / 64)
        }
      }
      out[u * 8 + v] = sum
    }
  }
  return out
}

function bitsToHex(bits: boolean[]): string {
  let hex = ''
  for (let i = 0; i < bits.length; i += 2) {
    const hi = bits[i] ? 8 : 0
    const lo = bits[i + 1] ? 1 : 0
    hex += (hi + lo).toString(16)
  }
  return hex
}

function phashFromGray(gray: Uint8Array): string {
  const dct = dct8(gray)
  const rest = Array.from(dct.slice(1))
  const mean = rest.reduce((a, b) => a + b, 0) / rest.length
  const bits = rest.map((v) => v > mean)
  const dc = dct[0] > 0
  return bitsToHex([dc, ...bits].slice(0, 64))
}

function ahashFromGray(gray: Uint8Array): string {
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length
  return bitsToHex(Array.from(gray, (v) => v > mean).slice(0, 64))
}

export function histogramFromRgb(rgb: Uint8Array, w: number, h: number): number[] {
  const hist = Array.from({ length: 64 }, () => 0)
  const total = w * h
  for (let i = 0; i < total; i++) {
    const r = rgb[i * 3] >> 6
    const g = rgb[i * 3 + 1] >> 6
    const b = rgb[i * 3 + 2] >> 6
    hist[(r << 4) | (g << 2) | b]++
  }
  return hist.map((c) => c / total)
}

function isSkin(r: number, g: number, b: number): boolean {
  // Wide-tone range: avoids bias against darker skin tones.
  return r > 40 && r >= g && r >= b && r - g > 4 && r - b > 2 && r < 250 && Math.abs(r - g) < 90
}

function findFaceLikeRegion(rgb: Uint8Array, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  // Cluster skin pixels on an 8x8 grid and box the densest cluster,
  // so scattered skin tones elsewhere do not blow up the region.
  const cells = Array.from({ length: 64 }, () => 0)
  const cw = w / 8
  const ch = h / 8
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      if (!isSkin(rgb[i], rgb[i + 1], rgb[i + 2])) continue
      cells[Math.min(7, Math.floor(y / ch)) * 8 + Math.min(7, Math.floor(x / cw))]++
    }
  }
  let best = 0
  for (const c of cells) if (c > best) best = c
  if (best < Math.max(40, (w * h) / 400)) return null
  const thresh = best * 0.25
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  let total = 0
  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 8; cx++) {
      if (cells[cy * 8 + cx] < thresh) continue
      total += cells[cy * 8 + cx]
      if (cx * cw < minX) minX = cx * cw
      if (cy * ch < minY) minY = cy * ch
      if ((cx + 1) * cw > maxX) maxX = (cx + 1) * cw
      if ((cy + 1) * ch > maxY) maxY = (cy + 1) * ch
    }
  }
  if (maxX < 0 || total === 0) return null
  const bw = maxX - minX
  const bh = maxY - minY
  if (bw < 4 || bh < 4) return null
  const areaFrac = (bw * bh) / (w * h)
  if (areaFrac < 0.02 || areaFrac > 0.75) return null
  const pad = Math.round(Math.max(bw, bh) * 0.12)
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  return { x, y, w: Math.min(w - x, bw + pad * 2), h: Math.min(h - y, bh + pad * 2) }
}

export async function tokenizeImage(dataUrl: string): Promise<PhotoToken> {
  const buf = dataUrlToBuffer(dataUrl)
  const { data: gray32, info: meta32 } = await sharp(buf)
    .resize(32, 32, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: rgb128, info: meta128 } = await sharp(buf)
    .resize(128, 128, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const faceBox = findFaceLikeRegion(rgb128, meta128.width, meta128.height)
  let facePhash: string | null = null
  if (faceBox) {
    const scaleX = meta32.width / 128
    const scaleY = meta32.height / 128
    const fx = Math.floor(faceBox.x * scaleX)
    const fy = Math.floor(faceBox.y * scaleY)
    const fw = Math.max(2, Math.round(faceBox.w * scaleX))
    const fh = Math.max(2, Math.round(faceBox.h * scaleY))
    const crop = new Uint8Array(fw * fh)
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const sx = Math.min(31, fx + x)
        const sy = Math.min(31, fy + y)
        crop[y * fw + x] = gray32[sy * 32 + sx]
      }
    }
    const resizedGray = new Uint8Array(32 * 32)
    for (let ty = 0; ty < 32; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        resizedGray[ty * 32 + tx] = crop[Math.floor((ty * fh) / 32) * fw + Math.floor((tx * fw) / 32)]
      }
    }
    facePhash = phashFromGray(resizedGray)
  }

  return {
    phash: phashFromGray(gray32),
    ahash: ahashFromGray(gray32),
    histogram: histogramFromRgb(rgb128, meta128.width, meta128.height),
    faceDetected: faceBox !== null,
    facePhash,
    faceBox,
    width: meta32.width,
    height: meta32.height,
  }
}

export function hammingSim(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    const d = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    for (let j = 0; j < 4; j++) if (d & (1 << j)) dist++
  }
  return 1 - dist / (a.length * 4)
}

export function histSim(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i])
  return s
}

export function scoreToken(q: PhotoToken, t: PhotoToken): { score: number; phashSim: number; histSim: number; faceSim: number | null } {
  const phashSim = hammingSim(q.phash, t.phash)
  const hist = histSim(q.histogram, t.histogram)
  let faceSim: number | null = null
  let score: number
  if (q.facePhash && t.facePhash) {
    faceSim = hammingSim(q.facePhash, t.facePhash)
    score = 0.65 * faceSim + 0.1 * phashSim + 0.25 * hist
  } else {
    score = 0.6 * phashSim + 0.4 * hist
  }
  return { score: Math.round(score * 1000) / 10, phashSim: Math.round(phashSim * 100), histSim: Math.round(hist * 100), faceSim: faceSim === null ? null : Math.round(faceSim * 100) }
}

// FACE-ONLY matching: ignore whole-photo signals entirely.
export function scoreFaceToken(q: PhotoToken, t: PhotoToken): { score: number; phashSim: number; faceSim: number | null } {
  const phashSim = hammingSim(q.phash, t.phash)
  if (q.facePhash && t.facePhash) {
    const faceSim = hammingSim(q.facePhash, t.facePhash)
    return { score: Math.round(faceSim * 1000) / 10, phashSim: Math.round(phashSim * 100), faceSim: Math.round(faceSim * 100) }
  }
  return { score: Math.round(phashSim * 1000) / 10, phashSim: Math.round(phashSim * 100), faceSim: null }
}

export type FolderPreset = 'vault' | 'documents' | 'desktop' | 'downloads' | 'custom'

const PRESET_DIRS: Record<Exclude<FolderPreset, 'vault' | 'custom'>, string> = {
  documents: 'Documents',
  desktop: 'Desktop',
  downloads: 'Downloads',
}

export function presetDir(preset: FolderPreset, vaultExportsDir: string, vaultBackupsDir: string, kind: 'exports' | 'backups'): string {
  if (preset === 'vault') return kind === 'exports' ? vaultExportsDir : vaultBackupsDir
  if (preset === 'custom') return kind === 'exports' ? vaultExportsDir : vaultBackupsDir
  return path.join(os.homedir(), PRESET_DIRS[preset], 'Zeus Vault', kind)
}

export function ensureWritableDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
