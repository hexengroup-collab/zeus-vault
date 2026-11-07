import { spawn, execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const isWin = process.platform === 'win32'
const npm = isWin ? 'npm.cmd' : 'npm'
const electronBin = path.join(root, 'node_modules', 'electron', 'dist', isWin ? 'electron.exe' : 'electron')

console.log('[zeus-vault] building main process...')
execFileSync(isWin ? 'npm.cmd' : 'npm', ['run', 'build:main'], { cwd: root, stdio: 'inherit', shell: isWin })

console.log('[zeus-vault] starting vite dev server...')
const vite = spawn(npm, ['run', 'dev:renderer'], { cwd: root, stdio: 'inherit', shell: isWin })

await waitForPort(5199, 60_000)

console.log('[zeus-vault] launching electron...')
const env = { ...process.env, ZEUS_DEV_URL: 'http://localhost:5199' }
const electron = spawn(electronBin, ['.'], { cwd: root, stdio: 'inherit', env })

electron.on('exit', (code) => {
  vite.kill()
  process.exit(code ?? 0)
})

async function waitForPort(port, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const up = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1')
      s.once('connect', () => { s.end(); resolve(true) })
      s.once('error', () => resolve(false))
    })
    if (up) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Timed out waiting for the vite dev server')
}
