// Captures the rendered page to verify the new VaultMark icon renders.
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
if (!page) {
  console.log('NO PAGE TARGET')
  process.exit(1)
}
await cdp(page.webSocketDebuggerUrl, 'Page.enable')
const shot = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })
const data = shot.result?.data
if (data) {
  fs.writeFileSync('D:/zeus-vault/shot.png', Buffer.from(data, 'base64'))
  console.log('screenshot saved')
} else {
  console.log('no screenshot data')
}
process.exit(0)
