// Logs out through the bridge and screenshots the login screen (login has the glass mark).
import fs from 'node:fs'
const TARGET = 'http://127.0.0.1:9222'
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
console.log('logout:', await evalIn('window.zeus.session.logout().then(r => JSON.stringify(r))'))
await new Promise((r) => setTimeout(r, 800))
await evalIn(`location.hash = '#/login'`)
await new Promise((r) => setTimeout(r, 1500))
await cdp(page.webSocketDebuggerUrl, 'Page.enable')
const shot = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })
const data = shot.result?.data
if (data) {
  fs.writeFileSync('D:/zeus-vault/shot-login.png', Buffer.from(data, 'base64'))
  console.log('screenshot saved')
}
process.exit(0)
