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
  match: { profileId: string; score: number; distance: number | null; name: string; code: string } | null
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
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
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

function cropToImage(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }, size = 160): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('Canvas unavailable'))
    ctx.fillStyle = '#0D0F12'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, size, size)
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
      const cropped = await cropToImage(img, box)
      const d = await nets.faceRecognitionNet.computeFaceDescriptor(cropped as unknown as HTMLCanvasElement)
      desc = d ? Array.from(d as unknown as Array<number>) : null
    } catch {
      desc = null
    }
    out.push({
      index: out.length,
      box,
      landmarks: lm,
      crop: cropToDataUrl(img, box),
      desc,
      match: null,
    })
  }
  return out
}

export async function captureDescriptor(imageSrc: string): Promise<number[] | null> {
  const faces = await detectPeople(imageSrc)
  return faces.length > 0 ? faces[0].desc ?? null : null
}
