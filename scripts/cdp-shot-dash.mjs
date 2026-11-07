// Logs in through the real UI and screenshots the dashboard (sidebar shows the new VaultMark).
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
    const timer = setTimeout(() => reject(new Error('CDP timeout')), timeoutMs)
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
await evalIn(`location.hash = '#/login'`)
await new Promise((r) => setTimeout(r, 900))
const setInput = (id, value) => `(() => { const el = document.querySelector('#' + ${JSON.stringify(id)}); if (!el) return 'missing ' + ${JSON.stringify(id)}; const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`
await evalIn(setInput('#username', USER))
await evalIn(setInput('#password', PASS))
await new Promise((r) => setTimeout(r, 300))
await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('AUTHENTICATE')); if (b) { b.click(); return 'clicked' } return 'missing' })()`)
await new Promise((r) => setTimeout(r, 3500))
await cdp(page.webSocketDebuggerUrl, 'Page.enable')
const shot = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })
const data = shot.result?.data
if (data) {
  fs.writeFileSync('D:/zeus-vault/shot-dash.png', Buffer.from(data, 'base64'))
  console.log('screenshot saved', await evalIn('location.hash'))
}
process.exit(0)
