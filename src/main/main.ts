import { app, BrowserWindow, protocol, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { AppContext } from './services/context'
import { registerIpc } from './ipc'
import { broadcastLocked } from './ipc'

const MCP_SERVE = process.argv.includes('--mcp-serve')
if (MCP_SERVE) {
  void import('./mcp/stdio')
    .then(async ({ runMcpStdio }) => {
      const rootDir = app.getPath('userData')
      fs.mkdirSync(rootDir, { recursive: true })
      const ctx = new AppContext(rootDir)
      try { ctx.open() } catch { /* tools will report locked state */ }
      await runMcpStdio(ctx)
      app.exit(0)
    })
    .catch((e) => {
      process.stderr.write(`[zeus-vault-mcp] fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`)
      app.exit(1)
    })
} else {

const DEV_URL = process.env.ZEUS_DEV_URL
const isDev = !!DEV_URL

const distDir = path.join(__dirname, '..', '..', 'dist')
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: false } },
])

function registerAppProtocol(): void {
  try {
    protocol.handle('app', async (req) => {
      const u = new URL(req.url)
      const host = u.hostname && u.hostname !== '.' ? `${u.hostname}/` : ''
      let rel = decodeURIComponent(`${host}${u.pathname}`).replace(/^\/+/, '')
      if (!rel || rel.endsWith('/')) rel = `${rel}index.html`
      const file = path.normalize(path.join(distDir, rel))
      const ok = file.startsWith(distDir) && fs.existsSync(file) && fs.statSync(file).isFile()
      bootLog(`app-protocol ${req.url} -> ${file} ${ok ? 'ok' : '404'}`)
      if (!ok) {
        return new Response('Not found', { status: 404 })
      }
      const data = fs.readFileSync(file)
      return new Response(data as BodyInit, { status: 200, headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' } })
    })
  } catch (e) {
    bootLog('[app://] handle registration failed', e)
  }
}

const bootLog = (msg: string, err?: unknown) => {
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const line = `${new Date().toISOString()} ${msg}${err ? ` :: ${(err as Error).stack ?? String(err)}` : ''}\n`
    fs.appendFileSync(path.join(dir, 'app.log'), line)
  } catch {
    /* ignore */
  }
}

let mainWindow: BrowserWindow | null = null
let ctx: AppContext | null = null
let lockTimer: NodeJS.Timeout | null = null

function createWindow(): BrowserWindow {
  const iconPath = path.join(__dirname, '..', '..', 'resources', 'icon.png')
  const win = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#08090B',
    title: 'Zeus Vault',
    frame: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  const broadcastMaximized = () => {
    win.webContents.send('window:maximized', win.isMaximized())
  }
  win.on('maximize', broadcastMaximized)
  win.on('unmaximize', broadcastMaximized)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isDev && DEV_URL && url.startsWith(DEV_URL!)) return
    if (!isDev && url.startsWith('app://')) return
    event.preventDefault()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    bootLog(`did-fail-load ${errorCode} ${errorDescription} @ ${validatedURL}`)
    if (!isDev && validatedURL?.startsWith('app://')) {
      void win.loadFile(path.join(distDir, 'index.html'))
    }
  })
  win.webContents.on('console-message', (_event, _level, message) => {
    bootLog(`[renderer] ${message}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    bootLog(`render-process-gone ${JSON.stringify(details)}`)
  })

  if (isDev) {
    void win.loadURL(DEV_URL!)
  } else {
    bootLog('loading app://./')
    void win.loadURL('app://./index.html')
  }
  return win
}

function startLockTimer(): void {
  if (lockTimer) clearInterval(lockTimer)
  lockTimer = setInterval(() => {
    try {
      if (ctx?.auth && ctx.auth.checkVaultTimeout() && mainWindow) {
        broadcastLocked(mainWindow)
      }
      // MCP layer: bring up when a live unlocked session exists.
      if (ctx?.vault && ctx.auth?.session && !ctx.auth.lockState.locked && ctx.settings?.get().mcpEnabled) {
        void ctx.mcp?.start().catch(() => undefined)
      }
    } catch {
      /* keep the timer alive */
    }
  }, 20_000)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.setAppUserModelId('com.zeusvault.app')
  app.whenReady().then(() => {
    registerAppProtocol()
    const rootDir = app.getPath('userData')
    fs.mkdirSync(rootDir, { recursive: true })
    ctx = new AppContext(rootDir)
    try {
      ctx.open()
    } catch (error) {
      bootLog('vault open failed', error)
      // Continue; the setup/login screens will surface the error via IPC.
    }
    registerIpc(ctx)
    mainWindow = createWindow()
    startLockTimer()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (lockTimer) clearInterval(lockTimer)
    ctx?.close()
    if (process.platform !== 'darwin') app.quit()
  })
}
}
