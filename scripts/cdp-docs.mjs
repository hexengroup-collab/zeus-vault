// Captures one screenshot per route for documentation.
import fs from 'node:fs'
const TARGET = 'http://127.0.0.1:9222'
const PASS = process.argv[2] ?? ''
const OUT = 'D:/zeus-vault/docs/screenshots'
fs.mkdirSync(OUT, { recursive: true })

async function getTargets() {
  const res = await fetch(`${TARGET}/json/list`)
  return res.json()
}
async function cdp(wsUrl, method, params, id = 1, timeoutMs = 15000) {
  const ws = new WebSocket(wsUrl)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout: ' + method)), timeoutMs)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id, method, params: params ?? {} })))
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.id === id) { clearTimeout(timer); resolve(msg); ws.close() }
    })
  })
}
const targets = await getTargets()
const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'))
if (!page) { console.log('NO PAGE TARGET'); process.exit(1) }
const evalIn = async (expr) => {
  const r = await cdp(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}
const bodyUpper = async () => ((await evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().toUpperCase()')) ?? '').toUpperCase()

await new Promise((r) => setTimeout(r, 1500))
await cdp(page.webSocketDebuggerUrl, 'Page.enable')

const shot = async (name) => {
  const r = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'))
}

async function goto(route, waitMs = 1500) {
  await evalIn(`location.hash = '${route}'`)
  await new Promise((r) => setTimeout(r, waitMs))
}

// Screens captured
const screens = [
  ['login', '#/login'],
  ['unlock', '#/unlock'],
  ['overview', '#/overview'],
  ['profiles', '#/profiles'],
  ['create', '#/profiles/new'],
  ['search', '#/search'],
  ['b2b', '#/b2b'],
  ['categories', '#/categories'],
  ['countries', '#/countries'],
  ['favorites', '#/favorites'],
  ['archived', '#/archived'],
  ['activity', '#/activity'],
  ['users', '#/users'],
  ['settings', '#/settings'],
  ['account', '#/account'],
  ['import', '#/import'],
  ['export', '#/export'],
  ['backups', '#/backups'],
  ['security', '#/security'],
  ['about', '#/about'],
]

// Try to unlock first if sealed
await goto('#/unlock', 900)
let body = await bodyUpper()
if (body.includes('SESSION SEALED')) {
  await evalIn(`(() => { const el = document.querySelector('#unlock-password'); const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(PASS)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`)
  await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('UNSEAL VAULT')); if (b) b.click() })()`)
  await new Promise((r) => setTimeout(r, 3000))
}
// Log in if needed
body = await bodyUpper()
if (body.includes('IDENTIFY YOURSELF')) {
  await evalIn(`(() => { const u = document.querySelector('#username'); const p = document.querySelector('#password'); const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(u, process.env.ZV_USER ?? ''); u.dispatchEvent(new Event('input', { bubbles: true })); d.set.call(p, ${JSON.stringify(PASS)}); p.dispatchEvent(new Event('input', { bubbles: true })); return 'set' })()`)
  await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('AUTHENTICATE')); if (b) b.click() })()`)
  await new Promise((r) => setTimeout(r, 3000))
}

for (const [name, route] of screens) {
  await goto(route)
  await shot(name)
  console.log('shot', name)
}
process.exit(0)
