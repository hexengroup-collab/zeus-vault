// Generates the Zeus Vault application icon set programmatically.
// Design: circular liquid-glass orb, deep graphite pearl with a soft specular
// streak and a molten gold lightning bolt. No external assets required.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const OUT = path.join(ROOT, 'resources')
fs.mkdirSync(OUT, { recursive: true })

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}
function writePng(file, rgba, size) {
  fs.writeFileSync(file, encodePng(rgba, size, size))
  console.log('wrote', file)
}

// ---------- Icon drawing ----------
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Lightning bolt polygon in unit coordinates [-1, 1]
const BOLT = [
  [0.16, -0.78],
  [-0.24, 0.08],
  [0.02, 0.08],
  [-0.16, 0.78],
  [0.30, -0.1],
  [0.04, -0.1],
]
function pointInPolygon(pts, x, y) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const s = size
  const cx = s / 2
  const cy = s / 2
  const R = s * 0.46 // main orb radius
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4
      const dx = (x - cx) / R
      const dy = (y - cy) / R
      const r = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      let R0 = 8, G0 = 9, B0 = 11, A = 0

      if (r <= 1.22) {
        // Outer ambient glow
        const glow = clamp(1.22 - r, 0, 0.22) / 0.22
        const ga = Math.pow(glow, 2.4) * 0.32
        R0 = 150 + 40 * glow
        G0 = 105 + 28 * glow
        B0 = 70 + 14 * glow
        A = ga
      }

      if (r <= 1.0) {
        // Sphere shading: light from top-left
        const light = clamp(0.5 - (dx * 0.62 + dy * 0.72) * 0.5, 0, 1)
        const edge = clamp((r - 0.86) / 0.14, 0, 1) // darker toward rim
        const shade = lerp(1.25, 0.42, clamp(r * 1.05, 0, 1)) * lerp(1.0, 0.92, edge)
        const hi = clamp(1 - Math.hypot(dx + 0.55, dy + 0.62) * 1.65, 0, 1) // key specular
        const hiPow = Math.pow(hi, 2.1)
        const spec = Math.pow(clamp(1 - Math.hypot(dx + 0.42, dy + 0.48) * 1.9, 0, 1), 3.2)
        // Base pearl graphite with a faint warm ember bottom
        let br = 40 + 34 * light * shade + 60 * hiPow + 150 * spec
        let bg = 44 + 36 * light * shade + 58 * hiPow + 145 * spec
        let bb = 52 + 42 * light * shade + 58 * hiPow + 140 * spec
        const warm = clamp(0.5 - dy * 0.9, 0, 1) * 0.32
        br += 26 * warm
        bg += 15 * warm
        // Thin inner glass ring
        const ringIn = clamp(1 - Math.abs(r - 0.9) * 26, 0, 1)
        br += 26 * ringIn
        bg += 27 * ringIn
        bb += 26 * ringIn
        A = 1
        R0 = br; G0 = bg; B0 = bb

        // Lightning bolt: molten gold with vertical gradient and bevel
        const bx = dx * 1.06
        const by = dy * 0.92
        if (pointInPolygon(BOLT, bx, by)) {
          const t = clamp((by + 0.78) / 1.56, 0, 1) // 0 top, 1 bottom
          // Gold gradient: bright crown, deep base
          const goldTop = [245, 181, 141]
          const goldMid = [224, 148, 102]
          const goldBot = [126, 58, 30]
          let gr, gg, gb
          if (t < 0.55) {
            const k = t / 0.55
            gr = lerp(goldTop[0], goldMid[0], k)
            gg = lerp(goldTop[1], goldMid[1], k)
            gb = lerp(goldTop[2], goldMid[2], k)
          } else {
            const k = (t - 0.55) / 0.45
            gr = lerp(goldMid[0], goldBot[0], k)
            gg = lerp(goldMid[1], goldBot[1], k)
            gb = lerp(goldMid[2], goldBot[2], k)
          }
          // Specular sweep across the upper bevel of the bolt
          const sweep = clamp(1 - Math.hypot(bx - 0.02, by + 0.35) * 2.6, 0, 1)
          gr += 90 * sweep * sweep
          gg += 80 * sweep * sweep
          gb += 60 * sweep * sweep
          // Inner shadow on bolt edges for carved-glass depth
          const inset = pointInPolygon(BOLT.map(([px2, py2]) => [px2 * 0.86, py2 * 0.86]), bx, by)
          if (!inset) { gr *= 0.5; gg *= 0.5; gb *= 0.45 }
          R0 = gr; G0 = gg; B0 = gb
        }
      }

      // Bright outer rim light on the top-left of the glass disc
      if (r > 0.955 && r <= 1.0) {
        const rimLight = clamp(Math.cos(angle + Math.PI * 0.72) * 0.5 + 0.5, 0, 1)
        const rimGlow = Math.pow(rimLight, 2.1)
        R0 = lerp(R0, 235, rimGlow * 0.5)
        G0 = lerp(G0, 235, rimGlow * 0.5)
        B0 = lerp(B0, 240, rimGlow * 0.5)
      }
      // Crisp silhouette edge
      if (r > 0.992 && r <= 1.0) { R0 = lerp(R0, 255, 0.35); G0 = lerp(G0, 255, 0.35); B0 = lerp(B0, 255, 0.35) }

      px[i] = clamp(Math.round(R0), 0, 255)
      px[i + 1] = clamp(Math.round(G0), 0, 255)
      px[i + 2] = clamp(Math.round(B0), 0, 255)
      px[i + 3] = clamp(Math.round(A * 255), 0, 255)
    }
  }
  return { px, size }
}

const pngs = []
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  const { px } = renderIcon(size)
  const file = path.join(OUT, `icon-${size}.png`)
  writePng(file, px, size)
  pngs.push({ size, file })
}

// Master icon.png (1024) used by the window
fs.copyFileSync(path.join(OUT, 'icon-1024.png'), path.join(OUT, 'icon.png'))

// Windows .ico with PNG-embedded frames
const icoSizes = [16, 32, 48, 64, 128, 256]
const icoPngs = icoSizes.map((s) => fs.readFileSync(path.join(OUT, `icon-${s}.png`)))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoSizes.length, 4)
let offset = 6 + 16 * icoSizes.length
const entries = []
for (let i = 0; i < icoSizes.length; i++) {
  const size = icoSizes[i]
  const data = icoPngs[i]
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
  entry.writeUInt8(0, 2) // palette
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(data.length, 8)
  entry.writeUInt32LE(offset, 12)
  entries.push(entry)
  offset += data.length
}
const ico = Buffer.concat([header, ...entries, ...icoPngs])
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico)
console.log('wrote', path.join(OUT, 'icon.ico'))
