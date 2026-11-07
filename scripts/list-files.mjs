// Lists the files proposed for the first public commit (mirrors .gitignore).
import fs from 'node:fs'
import path from 'node:path'
const ignore = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git', '.qoder', 'coverage'])
const files = []
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(e.name)) continue
    const full = path.join(dir, e.name)
    const r = `${rel}/${e.name}`
    if (e.isDirectory()) { walk(full, r); continue }
    if (/\.(db|db-wal|db-shm|zvbak|log|tsbuildinfo)$/.test(e.name)) continue
    files.push(r.replace(/^\.\//, ''))
  }
}
walk('D:/zeus-vault', '.')
files.sort()
console.log(files.length + ' files proposed')
console.log(files.join('\n'))
