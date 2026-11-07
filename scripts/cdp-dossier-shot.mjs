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
const id = await evalIn(`window.zeus.profiles.list({ view: 'active', page: 1, pageSize: 1 }).then(r => r.ok ? r.result.rows[0].id : 'error')`)
console.log('first profile id:', id)
if (!id || id === 'error') { process.exit(0) }
await evalIn(`location.hash = '#/profiles/${id}'`)
await new Promise((r) => setTimeout(r, 2500))
await cdp(page.webSocketDebuggerUrl, 'Page.enable')
const shot = await cdp(page.webSocketDebuggerUrl, 'Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) fs.writeFileSync('D:/zeus-vault/docs/screenshots/dossier.png', Buffer.from(shot.result.data, 'base64'))
console.log('saved dossier.png')
process.exit(0)
