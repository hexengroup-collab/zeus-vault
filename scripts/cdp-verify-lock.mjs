// Verifies manual lock survives a renderer refresh.
import fs from 'node:fs'
const TARGET = 'http://127.0.0.1:9222'
const USER = process.argv[2] ?? ''
const PASS = process.argv[3] ?? ''
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
const evalIn = async (expr) => {
  const r = await cdp(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}
const bodyText = () => evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 400)')

// Step 1: log in (or unlock if already on the lock screen)
let body = ''
for (let i = 0; i < 30; i++) {
  body = ((await bodyText()) ?? '').toUpperCase()
  if (body) break
  await new Promise((r) => setTimeout(r, 500))
}
if (body.includes('SESSION SEALED')) {
  await evalIn(`location.hash = '#/unlock'`)
  await new Promise((r) => setTimeout(r, 800))
  console.log('unlock screen detected; unlocking with credential...')
  await evalIn(`(() => { const el = document.querySelector('#unlock-password'); const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(PASS)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`)
  await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('UNSEAL VAULT')); if (b) { b.click(); return 'clicked' } return 'missing' })()`)
  await new Promise((r) => setTimeout(r, 3500))
  body = ((await bodyText()) ?? '').toUpperCase()
}
if (!body.includes('OVERVIEW')) {
  await evalIn(`location.hash = '#/login'`)
  await new Promise((r) => setTimeout(r, 900))
  const setInput = (id, value) => `(() => { const el = document.querySelector('#' + ${JSON.stringify(id)}); if (!el) return 'missing ' + ${JSON.stringify(id)}; const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`
  await evalIn(setInput('#username', USER))
  await evalIn(setInput('#password', PASS))
  await new Promise((r) => setTimeout(r, 300))
  await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('AUTHENTICATE')); if (b) { b.click(); return 'clicked' } return 'missing' })()`)
  await new Promise((r) => setTimeout(r, 3500))
  body = ((await bodyText()) ?? '').toUpperCase()
}
console.log('authenticated:', body.includes('OVERVIEW'))

// Step 2: press LOCK (top bar)
console.log('lock click:', await evalIn(`(() => { const b = document.querySelector('[aria-label="Lock vault"]'); if (b) { b.click(); return 'clicked' } return 'missing lock button' })()`))
await new Promise((r) => setTimeout(r, 1200))
console.log('after lock sealed:', (await bodyText()).toUpperCase().includes('SESSION SEALED'))

// Step 3: refresh the page and confirm we stay on the lock screen
console.log('reload:', await cdp(page.webSocketDebuggerUrl, 'Page.reload').then(() => 'reloaded').catch((e) => String(e)))
await new Promise((r) => setTimeout(r, 4500))
const afterRefresh = ((await bodyText()) ?? '').toUpperCase()
console.log('after refresh sealed:', afterRefresh.includes('SESSION SEALED') || afterRefresh.includes('RE-ENTER PASSWORD'))
console.log('after refresh overview:', afterRefresh.includes('OVERVIEW'))

await cdp(page.webSocketDebuggerUrl, 'Page.enable')
const shot = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) fs.writeFileSync('D:/zeus-vault/shot-lock.png', Buffer.from(shot.result.data, 'base64'))
console.log('screenshot saved')
process.exit(0)
