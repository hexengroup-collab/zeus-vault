// Screenshots the Settings Security tab (MCP card) after unlocking.
import fs from 'node:fs'
const TARGET = 'http://127.0.0.1:9222'
const PASS = process.argv[2] ?? ''
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
const bodyUpper = async () => ((await evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().toUpperCase()')) ?? '').toUpperCase()

let body = ''
for (let i = 0; i < 30; i++) {
  body = await bodyUpper()
  if (body) break
  await new Promise((r) => setTimeout(r, 500))
}
if (body.includes('SESSION SEALED')) {
  await evalIn(`(() => { const el = document.querySelector('#unlock-password'); const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(PASS)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`)
  await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('UNSEAL VAULT')); if (b) b.click() })()`)
  await new Promise((r) => setTimeout(r, 3500))
}
await evalIn(`location.hash = '#/settings'`)
await new Promise((r) => setTimeout(r, 1800))
await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('SECURITY')); if (b) b.click() })()`)
await new Promise((r) => setTimeout(r, 1600))
await evalIn(`(() => { const el = [...document.querySelectorAll('*')].find(x => x.childElementCount === 0 && x.textContent.includes('MCP Layer')); if (el) el.scrollIntoView({ block: 'center' }) })()`)
await new Promise((r) => setTimeout(r, 900))
await cdp(page.webSocketDebuggerUrl, 'Page.enable')
const shot = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) fs.writeFileSync('D:/zeus-vault/shot-security.png', Buffer.from(shot.result.data, 'base64'))
console.log('screenshot saved')
process.exit(0)
