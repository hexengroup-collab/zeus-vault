// Renders the custom ZEUS VAULT security icon set to PNG via sharp.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../docs/assets')
fs.mkdirSync(OUT, { recursive: true })

const CRIMSON = '#E34B64'
const SILVER = '#A7ADB5'
const WHITE = '#F1F1F1'

const sig = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">`

function tile(inner, extra = '') {
  return `${sig}
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#232830"/>
      <stop offset="1" stop-color="#111418"/>
    </linearGradient>
    <radialGradient id="h" cx="50%" cy="38%" r="65%">
      <stop offset="0" stop-color="#F1F1F1" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#F1F1F1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="56" y="56" width="400" height="400" rx="96" fill="url(#g)" stroke="${CRIMSON}" stroke-opacity="0.35" stroke-width="4"/>
  <rect x="56" y="56" width="400" height="400" rx="96" fill="url(#h)"/>
  ${inner}
  ${extra}
</svg>`
}

const icons = {
  'zeus-emblem': {
    size: 1024,
    svg: tile(`
      <!-- Shield -->
      <path d="M256 108 L380 150 L380 260 C380 336 330 384 256 412 C182 384 132 336 132 260 L132 150 Z" fill="none" stroke="${CRIMSON}" stroke-width="26" stroke-linejoin="round"/>
      <!-- inner vault door -->
      <circle cx="256" cy="262" r="66" fill="none" stroke="${WHITE}" stroke-width="14"/>
      <circle cx="256" cy="262" r="14" fill="${CRIMSON}"/>
      <path d="M256 196 L256 224 M256 300 L256 328 M190 262 L218 262 M294 262 L322 262" stroke="${WHITE}" stroke-width="14" stroke-linecap="round"/>
      <!-- lightning -->
      <path d="M266 228 L244 266 L260 266 L252 292 L278 254 L262 254 L272 228 Z" fill="${CRIMSON}"/>`),
  },
  'security-shield': {
    size: 512,
    svg: tile(`
      <path d="M256 120 L372 162 L372 266 C372 334 322 380 256 406 C190 380 140 334 140 266 L140 162 Z" fill="none" stroke="${SILVER}" stroke-width="26" stroke-linejoin="round"/>
      <path d="M188 266 L240 318 L324 214" fill="none" stroke="${CRIMSON}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`),
  },
  'encryption-lock': {
    size: 512,
    svg: tile(`
      <path d="M166 250 L166 182 C166 132 204 104 256 104 C308 104 346 132 346 182 L346 250" fill="none" stroke="${WHITE}" stroke-width="26" stroke-linecap="round"/>
      <rect x="142" y="250" width="228" height="144" rx="26" fill="none" stroke="${SILVER}" stroke-width="26"/>
      <circle cx="256" cy="306" r="26" fill="${CRIMSON}"/>
      <path d="M256 306 L256 340" stroke="${CRIMSON}" stroke-width="24" stroke-linecap="round"/>
      <path d="M176 160 C176 130 196 118 214 118" fill="none" stroke="${CRIMSON}" stroke-width="16" stroke-linecap="round" stroke-opacity="0.8"/>`),
  },
  'fingerprint-security': {
    size: 512,
    svg: tile(`
      <g fill="none" stroke="${SILVER}" stroke-width="16" stroke-linecap="round" opacity="0.95">
        <path d="M256 128 C330 128 386 184 386 258 C386 300 372 340 340 370"/>
        <path d="M256 154 C318 154 360 200 360 260 C360 296 348 330 322 356"/>
        <path d="M256 182 C306 182 334 214 334 262 C334 292 324 320 306 344"/>
        <path d="M256 312 L256 210"/>
        <path d="M256 312 C214 312 178 300 152 274"/>
        <path d="M256 128 C182 128 126 184 126 258 C126 300 140 340 172 370"/>
      </g>
      <circle cx="256" cy="318" r="30" fill="${CRIMSON}"/>
      <circle cx="256" cy="252" r="10" fill="${CRIMSON}"/>`),
  },
  'secure-database': {
    size: 512,
    svg: tile(`
      <ellipse cx="256" cy="138" rx="128" ry="40" fill="none" stroke="${SILVER}" stroke-width="24"/>
      <path d="M128 138 L128 374 M384 138 L384 374" stroke="${SILVER}" stroke-width="24"/>
      <ellipse cx="256" cy="256" rx="128" ry="40" fill="none" stroke="${WHITE}" stroke-width="24"/>
      <ellipse cx="256" cy="374" rx="128" ry="40" fill="none" stroke="${CRIMSON}" stroke-width="24"/>
      <path d="M320 256 L368 256" stroke="${CRIMSON}" stroke-width="18" stroke-linecap="round"/>
      <circle cx="384" cy="256" r="10" fill="${CRIMSON}"/>`),
  },
  'identity-key': {
    size: 512,
    svg: tile(`
      <rect x="118" y="150" width="200" height="140" rx="22" fill="none" stroke="${SILVER}" stroke-width="22"/>
      <path d="M142 196 H278 M142 226 H206" stroke="${WHITE}" stroke-width="14" stroke-linecap="round"/>
      <circle cx="330" cy="312" r="66" fill="none" stroke="${CRIMSON}" stroke-width="22"/>
      <path d="M330 378 L330 414 M330 392 L356 392 M330 406 L350 406" stroke="${CRIMSON}" stroke-width="20" stroke-linecap="round"/>`),
  },
  'integrity-verification': {
    size: 512,
    svg: tile(`
      <path d="M256 110 L376 156 L376 252 C376 326 324 374 256 410 C188 374 136 326 136 252 L136 156 Z" fill="none" stroke="${CRIMSON}" stroke-width="22" stroke-linejoin="round"/>
      <path d="M186 258 L240 312 L328 206" fill="none" stroke="${WHITE}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>`),
  },
  'audit-ledger': {
    size: 512,
    svg: tile(`
      <g fill="none" stroke="${SILVER}" stroke-width="24">
        <rect x="142" y="132" width="228" height="66" rx="18"/>
        <rect x="142" y="224" width="228" height="66" rx="18"/>
        <rect x="142" y="316" width="228" height="66" rx="18"/>
      </g>
      <g stroke="${CRIMSON}" stroke-width="16" stroke-linecap="round">
        <path d="M166 165 L210 165"/>
        <path d="M166 257 L250 257"/>
        <path d="M166 349 L176 349"/>
      </g>
      <path d="M404 158 L404 316" stroke="${CRIMSON}" stroke-width="14" stroke-dasharray="2 16" stroke-linecap="round"/>
      <circle cx="404" cy="132" r="10" fill="${CRIMSON}"/>
      <circle cx="404" cy="224" r="10" fill="${CRIMSON}"/>
      <circle cx="404" cy="316" r="10" fill="${CRIMSON}"/>`),
  },
  'offline-infrastructure': {
    size: 512,
    svg: tile(`
      <path d="M140 262 L256 140 L372 262" fill="none" stroke="${WHITE}" stroke-width="26" stroke-linejoin="round"/>
      <path d="M170 252 L170 386 L342 386 L342 252" fill="none" stroke="${SILVER}" stroke-width="26" stroke-linejoin="round"/>
      <circle cx="256" cy="322" r="30" fill="none" stroke="${CRIMSON}" stroke-width="16"/>
      <path d="M256 296 L256 348" stroke="${CRIMSON}" stroke-width="12" stroke-linecap="round"/>
      <path d="M216 380 L296 380" stroke="${CRIMSON}" stroke-width="12" stroke-linecap="round" stroke-dasharray="1 18"/>`),
  },
  'mcp-network': {
    size: 512,
    svg: tile(`
      <g stroke="${SILVER}" stroke-width="14" stroke-linecap="round">
        <path d="M256 256 L158 168"/>
        <path d="M256 256 L354 168"/>
        <path d="M256 256 L158 344"/>
        <path d="M256 256 L354 344"/>
      </g>
      <circle cx="256" cy="256" r="42" fill="none" stroke="${CRIMSON}" stroke-width="20"/>
      <circle cx="256" cy="256" r="10" fill="${CRIMSON}"/>
      <circle cx="158" cy="168" r="20" fill="none" stroke="${WHITE}" stroke-width="18"/>
      <circle cx="354" cy="168" r="20" fill="none" stroke="${WHITE}" stroke-width="18"/>
      <circle cx="158" cy="344" r="20" fill="none" stroke="${WHITE}" stroke-width="18"/>
      <circle cx="354" cy="344" r="20" fill="none" stroke="${WHITE}" stroke-width="18"/>`),
  },
}

for (const [name, { size, svg }] of Object.entries(icons)) {
  const out = path.join(OUT, `${name}.png`)
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
  const stat = fs.statSync(out)
  console.log(name + '.png', size + 'px', Math.round(stat.size / 1024) + ' KB')
}
console.log('assets written to', OUT)
