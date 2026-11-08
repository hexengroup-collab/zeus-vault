// Hybrid local face engine:
//  - MediaPipe FaceLandmarker detects faces incl. side profiles + 478 landmarks
//  - face-api descriptor net emits deep 128-dim descriptors for matching
//  - geometry (eye/mouth/ear/chin ratios) kept for evidence
// Everything runs on-device; model assets ship in public/.
import * as tf from '@tensorflow/tfjs'
import { nets } from '@vladmandic/face-api'

export interface DetectedFace {
  index: number
  box: { x: number; y: number; w: number; h: number }
  landmarks: { x: number; y: number }[]
  crop: string
  desc: number[] | null
  geom: number[] | null
  quality: number
  match: { profileId: string; score: number; distance: number | null; name: string; code: string } | null
}

function spreadQuality(lm: { x: number; y: number }[]): number {
  if (!lm?.length) return 0
  const xs = lm.map((p) => p.x)
  const ys = lm.map((p) => p.y)
  const sx = Math.max(...xs) - Math.min(...xs)
  const sy = Math.max(...ys) - Math.min(...ys)
  if (sx < 1e-4 || sy < 1e-4) return 0
  return Math.min(1, Math.max(0, sx / sy))
}

// Must match biometricsFromLandmarks in src/main/lib/vision.ts.
export function faceGeometry(lm: { x: number; y: number; z?: number }[]): number[] | null {
  if (!lm || lm.length < 479) return null
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
  const height = dist(lm[10], lm[152])
  if (!Number.isFinite(height) || height < 1e-6) return null
  const eyeMid = { x: (lm[133].x + lm[362].x) / 2, y: (lm[133].y + lm[362].y) / 2 }
  const dz = (a: { z?: number }, b: { z?: number }) => Math.abs((a.z ?? 0) - (b.z ?? 0)) / height
  const feats = [
    dist(lm[1], lm[152]) / height,
    dist(eyeMid, lm[1]) / height,
    dist(eyeMid, lm[152]) / height,
    dist(lm[127], lm[152]) / height,
    dist(lm[356], lm[152]) / height,
    dist(lm[61], lm[291]) / height,
    dist(lm[13], lm[14]) / height,
    dist(lm[127], lm[1]) / height,
    dist(lm[356], lm[1]) / height,
    dist(lm[234], lm[454]) / height,
    dist(lm[133], lm[362]) / height,
    dz(lm[1], lm[10]),
    dz(lm[1], lm[152]),
  ]
  return feats.map((v) => Math.round(v * 10000) / 10000)
}

export async function captureGeometry(imageSrc: string): Promise<number[] | null> {
  const faces = await detectPeople(imageSrc)
  return faces.length > 0 ? faces[0].geom ?? null : null
}

interface Landmarker {
  detect: (img: HTMLImageElement) => { faceLandmarks: { x: number; y: number }[][] }
  close: () => void
}

let faPromise: Promise<void> | null = null
let mpPromise: Promise<Landmarker> | null = null

async function getApi(): Promise<void> {
  if (!faPromise) {
    faPromise = (async () => {
      await tf.setBackend('cpu')
      await tf.ready()
      const uri = new URL('models2', document.baseURI).href
      await nets.faceRecognitionNet.loadFromUri(uri)
    })()
  }
  return faPromise
}

async function getLandmarker(): Promise<Landmarker> {
  if (!mpPromise) {
    mpPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(new URL('wasm', document.baseURI).href)
      const modelUrl = new URL('models/face_landmarker.task', document.baseURI).href
      const buf = new Uint8Array(await (await fetch(modelUrl)).arrayBuffer())
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf },
        runningMode: 'IMAGE',
        numFaces: 20,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
        outputFacialTransformationMatrixes: false,
        outputFaceBlendshapes: false,
      } as never)
    })()
  }
  return mpPromise
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the image.'))
    img.src = src
  })
}

async function multiCrops(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement[]> {
  const crops: HTMLCanvasElement[] = [await cropToImage(img, box)]
  // Padded + enhanced variants stabilize blurry/low-res reads.
  const pad = (p: number) => ({ x: box.x - box.w * 0.25 * p, y: box.y - box.h * 0.25 * p, w: box.w * (1 + 0.5 * p), h: box.h * (1 + 0.5 * p) })
  for (const p of [1, 2]) {
    try {
      const c = await cropToImage(img, pad(p), 160, { enhance: true })
      crops.push(c)
    } catch { /* partial set is fine */ }
  }
  // Shading/emboss view: surface gradients only (color-invariant, edit-robust).
  try {
    const embossed = embossCrop(img, box)
    if (embossed) crops.push(embossed)
  } catch { /* optional */ }
  return crops
}

function embossCrop(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }, size = 160): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size)
  const px = data.data
  const gray = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114
  }
  // Sobel gradient magnitude, contrast-stretched to mid-gray (normal-map of structure).
  const out = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size - 2; y++) {
    for (let x = 0; x < size - 2; x++) {
      const gi = y * size + x
      const gx = -gray[(y) * size + x] - 2 * gray[(y + 1) * size + x] - gray[(y + 2) * size + x] + gray[(y) * size + x + 2] + 2 * gray[(y + 1) * size + x + 2] + gray[(y + 2) * size + x + 2]
      const gy = -gray[(y) * size + x] - 2 * gray[(y) * size + x + 1] - gray[(y) * size + x + 2] + gray[(y + 2) * size + x] + 2 * gray[(y + 2) * size + x + 1] + gray[(y + 2) * size + x + 2]
      const grad = Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4)
      const o = gi * 4
      out[o] = 128 + (grad - 128) * 1.6
      out[o + 1] = 128 + (grad - 128) * 1.6
      out[o + 2] = 128 + (grad - 128) * 1.6
      out[o + 3] = 255
    }
  }
  data.data.set(out)
  ctx.putImageData(data, 0, 0)
  return canvas
}

function cropToImage(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }, size = 160, opts?: { enhance?: boolean }): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('Canvas unavailable'))
    ctx.fillStyle = '#0D0F12'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, size, size)
    if (opts?.enhance) {
      // Brighten + raise contrast for the low-res/blur robustness pass.
      const data = ctx.getImageData(0, 0, size, size)
      const px = data.data
      for (let i = 0; i < px.length; i += 4) {
        px[i] = Math.min(255, 255 * (0.5 + (px[i] - 128) / 128))
        px[i + 1] = Math.min(255, 255 * (0.5 + (px[i + 1] - 128) / 128))
        px[i + 2] = Math.min(255, 255 * (0.5 + (px[i + 2] - 128) / 128))
      }
      ctx.putImageData(data, 0, 0)
    }
    resolve(canvas)
  })
}

function cropToDataUrl(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }, size = 160): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#0D0F12'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export async function detectPeople(imageSrc: string): Promise<DetectedFace[]> {
  await getApi()
  const img = await loadImage(imageSrc)
  const landmarker = await getLandmarker()
  const result = landmarker.detect(img) as { faceLandmarks: { x: number; y: number }[][] }
  const lmList = result.faceLandmarks ?? []
  const out: DetectedFace[] = []
  for (const lm of lmList) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of lm) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.12
    const box = {
      x: Math.max(0, (minX - pad) * img.naturalWidth),
      y: Math.max(0, (minY - pad) * img.naturalHeight),
      w: Math.min(img.naturalWidth, (maxX - minX + pad * 2) * img.naturalWidth),
      h: Math.min(img.naturalHeight, (maxY - minY + pad * 2) * img.naturalHeight),
    }
    let desc: number[] | null = null
    try {
      const variants = await multiCrops(img, box)
      const vecs: number[][] = []
      for (const cropped of variants) {
        const d = await nets.faceRecognitionNet.computeFaceDescriptor(cropped as unknown as HTMLCanvasElement)
        if (d) vecs.push(Array.from(d as unknown as Array<number>))
      }
      if (vecs.length) {
        const mean = Array.from({ length: vecs[0].length }, () => 0)
        for (const v of vecs) for (let i = 0; i < mean.length; i++) mean[i] += v[i] / vecs.length
        const norm = Math.sqrt(mean.reduce((a, b) => a + b * b, 0)) || 1
        desc = mean.map((x) => x / norm)
      }
    } catch {
      desc = null
    }
    out.push({
      index: out.length,
      box,
      landmarks: lm,
      crop: cropToDataUrl(img, box),
      geom: faceGeometry(lm),
      desc,
      quality: spreadQuality(lm),
      match: null,
    })
  }
  return out
}

export async function captureDescriptor(imageSrc: string): Promise<number[] | null> {
  const faces = await detectPeople(imageSrc)
  return faces.length > 0 ? faces[0].desc ?? null : null
}
