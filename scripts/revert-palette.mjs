// Reverts the app-wide Claude orange palette sweep; only the icon stays Claude orange.
import fs from 'node:fs'
import path from 'node:path'

const SRC = 'D:/zeus-vault/src'
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { walk(full); continue }
    if (!/\.(ts|tsx|css)$/.test(e.name)) continue
    let s = fs.readFileSync(full, 'utf8')
    const before = s
    s = s.split('#D97757').join('#E34B64')
    s = s.split('#E69470').join('#F0637C')
    s = s.split('217, 119, 87').join('227, 75, 100')
    s = s.split('#1A0F0A').join('#0D0507')
    // warm backgrounds back to the original cool charcoal
    s = s.split('#171510').join('#0C0E11')
    s = s.split('#1B1814').join('#0E1013')
    s = s.split('#231F1A').join('#10131A')
    s = s.split('#14110D').join('#0B0D10')
    s = s.split('#201C17').join('#121519')
    if (s !== before) fs.writeFileSync(full, s)
  }
}
walk(SRC)

// index.css tokens and warm neon text colors to originals
{
  const f = path.join(SRC, 'renderer/src/styles/index.css')
  let s = fs.readFileSync(f, 'utf8')
  s = s.split('background-color: #111009').join('background-color: #08090B')
  s = s.split('background: #111009').join('background: #08090B')
  s = s.replace(/--color-vault-bg: #111009/, '--color-vault-bg: #08090B')
  s = s.replace(/--color-vault-bg2: #1B1814/, '--color-vault-bg2: #101216')
  s = s.replace(/--color-vault-surface: #231F1A/, '--color-vault-surface: #15181D')
  s = s.replace(/--color-vault-surface2: #2C2822/, '--color-vault-surface2: #1B1F26')
  s = s.replace(/--color-vault-text: #F5EFE4/, '--color-vault-text: #F2F2F0')
  s = s.replace(/--color-vault-text2: #A39887/, '--color-vault-text2: #858991')
  s = s.replace(/--color-vault-muted: #6F675C/, '--color-vault-muted: #555B65')
  s = s.replace(/rgba\(255, 250, 240, 0\.1\)/g, 'rgba(255, 255, 255, 0.1)')
  s = s.replace(/rgba\(255, 250, 240, 0\.06\)/g, 'rgba(255, 255, 255, 0.06)')
  fs.writeFileSync(f, s)
}

console.log('palette reverted; icon keeps Claude orange')
