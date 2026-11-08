// Local multi-face detection + landmark mesh (MediaPipe, fully offline).
// Model + WASM assets ship in public/ so nothing is ever uploaded.
export interface DetectedFace {
  index: number
  box: { x: number; y: number; w: number; h: number }
  landmarks: { x: number; y: number }[]
  crop: string
  geom: number[] | null
  match: { profileId: string; score: number; name: string; code: string } | null
}

const IO_A = 133
const IO_B = 362
const ANCHORS = [1, 152, 61, 291, 13, 14, 127, 356, 10, 234, 454, 168]
export function faceGeometry(lm: { x: number; y: number }[]): number[] | null {
  if (!lm || lm.length < 479) return null
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
  const io = dist(lm[IO_A], lm[IO_B])
  if (!Number.isFinite(io) || io < 1e-6) return null
  const mid = { x: (lm[IO_A].x + lm[IO_B].x) / 2, y: (lm[IO_A].y + lm[IO_B].y) / 2 }
  const out = ANCHORS.map((i) => Math.round((dist(lm[i], mid) / io) * 10000) / 10000)
  out.push(Math.round((dist(lm[61], lm[291]) / io) * 10000) / 10000, Math.round((dist(lm[1], lm[IO_A]) / io) * 10000) / 10000)
  return out
}

let landmarkerPromise: Promise<unknown> | null = null

async function getLandmarker(): Promise<{ landmarker: { detect: (img: HTMLImageElement) => { faceLandmarks: { x: number; y: number }[][] }; close: () => void }; tess: { start: number; end: number }[] }> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(new URL('wasm', document.baseURI).href)
      const modelUrl = new URL('models/face_landmarker.task', document.baseURI).href
      const buf = new Uint8Array(await (await fetch(modelUrl)).arrayBuffer())
      const lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf },
        runningMode: 'IMAGE',
        numFaces: 20,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        outputFacialTransformationMatrixes: false,
        outputFaceBlendshapes: false,
      } as never)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tess = (FaceLandmarker as any).FACE_LANDMARKS_TESSELATION as { start: number; end: number }[]
      return { landmarker: lm as never, tess }
    })()
  }
  return landmarkerPromise as never
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the image.'))
    img.src = src
  })
}

export function cropFace(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }): string {
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

export async function captureGeometry(imageSrc: string): Promise<number[] | null> {
  const { faces } = await detectPeople(imageSrc)
  return faces.length > 0 ? faces[0].geom ?? null : null
}

export async function detectPeople(imageSrc: string): Promise<{ faces: DetectedFace[]; tess: { start: number; end: number }[]; width: number; height: number }> {
  const img = await loadImage(imageSrc)
  const { landmarker, tess } = await getLandmarker()
  const result = landmarker.detect(img) as { faceLandmarks: { x: number; y: number }[][] }
  const faces: DetectedFace[] = []
  for (const lm of result.faceLandmarks ?? []) {
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
    faces.push({ index: faces.length, box, landmarks: lm, crop: cropFace(img, box), geom: faceGeometry(lm), match: null })
  }
  return { faces, tess, width: img.naturalWidth, height: img.naturalHeight }
}
