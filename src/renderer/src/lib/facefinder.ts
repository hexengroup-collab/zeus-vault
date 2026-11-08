// Local deep face matching (face-api.js descriptors, same approach as
// ageitgey/face_recognition: detection + 128-dim descriptors + distance).
// Models ship in public/models2 so everything runs on-device.
import * as tf from '@tensorflow/tfjs'
import {
  nets,
  detectAllFaces,
  SsdMobilenetv1Options,
} from '@vladmandic/face-api'

export interface DetectedFace {
  index: number
  box: { x: number; y: number; w: number; h: number }
  landmarks: { x: number; y: number }[]
  crop: string
  desc: number[] | null
  match: { profileId: string; score: number; name: string; code: string } | null
}

let readyPromise: Promise<boolean> | null = null

export async function ensureFaceModels(): Promise<boolean> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await tf.setBackend('cpu')
      await tf.ready()
      const uri = new URL('models2', document.baseURI).href
      await Promise.all([
        nets.ssdMobilenetv1.loadFromUri(uri),
        nets.faceLandmark68Net.loadFromUri(uri),
        nets.faceRecognitionNet.loadFromUri(uri),
      ])
      return true
    })()
  }
  return readyPromise
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the image.'))
    img.src = src
  })
}

function cropFace(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }): string {
  const canvas = document.createElement('canvas')
  const size = 160
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
  await ensureFaceModels()
  const img = await loadImage(imageSrc)
  const detections = await detectAllFaces(img, new SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors()
  return detections
    .map((d) => {
      const raw = d as unknown as { box?: { x: number; y: number; width: number; height: number }; detection?: { box: { x: number; y: number; width: number; height: number } }; landmarks?: { positions?: { x: number; y: number }[] }; descriptor?: Array<number> }
      const b = raw.detection?.box ?? raw.box ?? { x: 0, y: 0, width: 0, height: 0 }
      const desc = raw.descriptor ? Array.from(raw.descriptor as unknown as Array<number>) : null
      return {
        _b: b,
        _lm: raw.landmarks?.positions ?? [],
        _desc: desc,
      }
    })
    .sort((a, b) => a._b.x - b._b.x)
    .map((d, i) => {
      const box = { x: d._b.x, y: d._b.y, w: d._b.width, h: d._b.height }
      return {
        index: i,
        box,
        landmarks: d._lm,
        crop: cropFace(img, box),
        desc: d._desc,
        match: null,
      }
    })
}

export async function captureDescriptor(imageSrc: string): Promise<number[] | null> {
  const faces = await detectPeople(imageSrc)
  return faces.length > 0 ? faces[0].desc ?? null : null
}
