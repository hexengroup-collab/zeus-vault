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
  faceGeom: number[] | null
  width: number
  height: number
}

export interface PhotoMatch {
  tokenId: string
  profileId: string
  kind: 'avatar' | 'gallery' | 'attachment'
  score: number
  phashSim: number
  histSim: number
  faceSim: number | null
  faceDetected: boolean
  label?: string
  image?: string | null
}

// Descriptor distance with ageitgey-tolerance semantics:
// descriptors are L2-normalized (distance 0..2); <= 0.5 counts as a match.
export function descriptorDistance(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length !== b.length || a.length === 0) return null
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i])
  return Math.sqrt(s)
}

export const DESCRIPTOR_TOLERANCE = 0.5
// The winner must also beat the runner-up by this margin to be an identity.
export const DESCRIPTOR_MARGIN = 0.2

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
  // Tight crop: wide/tall boxes pull in background and kill precision.
  const side = Math.max(bw, bh)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const x = Math.round(Math.max(0, Math.min(w - side, cx - side / 2)))
  const y = Math.round(Math.max(0, Math.min(h - side, cy - side / 2)))
  return { x, y, w: side, h: side }
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

  // Canonical face data comes from the renderer face pipeline (MediaPipe).
  // Main-side skin heuristics mislabel non-face regions, so they never
  // create face claims here.
  void rgb128
  void findFaceLikeRegion
  const faceBox = null
  const facePhash: string | null = null

  return {
    phash: phashFromGray(gray32),
    ahash: ahashFromGray(gray32),
    histogram: histogramFromRgb(rgb128, meta128.width, meta128.height),
    faceDetected: false,
    facePhash,
    faceBox,
    faceGeom: null,
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

// Face geometry: relative distances between anatomical anchors, normalized
// by face height (forehead-to-chin) so it stays stable for frontal views
// AND side profiles. Distances are mirror-invariant.
const IO_A = 133
const IO_B = 362
const NOSE = 1
const CHIN = 152
const FOREHEAD = 10
const MOUTH_L = 61
const MOUTH_R = 291
const MOUTH_TOP = 13
const MOUTH_BOT = 14
const EAR_A = 127
const EAR_B = 356
const CHEEK_A = 234
const CHEEK_B = 454
export function biometricsFromLandmarks(lm: { x: number; y: number }[]): number[] | null {
  if (!lm || lm.length < 479) return null
  const pt = (i: number) => lm[i]
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
  const height = dist(pt(FOREHEAD), pt(CHIN))
  if (!Number.isFinite(height) || height < 1e-6) return null
  const io = dist(pt(IO_A), pt(IO_B))
  const eyeMid = { x: (pt(IO_A).x + pt(IO_B).x) / 2, y: (pt(IO_A).y + pt(IO_B).y) / 2 }
  const feats = [
    dist(pt(NOSE), pt(CHIN)) / height,
    dist(eyeMid, pt(NOSE)) / height,
    dist(eyeMid, pt(CHIN)) / height,
    dist(pt(EAR_A), pt(CHIN)) / height,
    dist(pt(EAR_B), pt(CHIN)) / height,
    dist(pt(MOUTH_L), pt(MOUTH_R)) / height,
    dist(pt(MOUTH_TOP), pt(MOUTH_BOT)) / height,
    dist(pt(EAR_A), pt(NOSE)) / height,
    dist(pt(EAR_B), pt(NOSE)) / height,
    dist(pt(CHEEK_A), pt(CHEEK_B)) / height,
    io / height,
  ]
  return feats.map((v) => Math.round(v * 10000) / 10000)
}

export function cosineSim(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length !== b.length || a.length === 0) return null
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return null
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
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
