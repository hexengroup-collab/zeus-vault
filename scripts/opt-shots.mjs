// Optimizes screenshots (resize + JPEG) for fast GitHub rendering.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../docs/screenshots')
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.png')) continue
  const p = path.join(DIR, f)
  const before = fs.statSync(p).size
  const tmp = path.join(DIR, f.replace('.png', '.jpg'))
  const info = await sharp(p).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(tmp)
  fs.unlinkSync(p)
  console.log(tmp.split(path.sep).pop(), Math.round(before / 1024) + ' -> ' + Math.round(fs.statSync(tmp).size / 1024) + ' KB', info.width + 'x' + info.height)
}
console.log('done')
