// Verifies API key revocation takes effect immediately.
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
const kc = JSON.parse(await evalIn('window.zeus.apikeys.generate("revoke test").then(r => JSON.stringify(r))'))
const tempKey = kc.ok ? kc.result.key : null
const keyId = kc.ok ? kc.result.id : null
console.log('temp key generated:', !!tempKey)

async function callTool(name, args, token) {
  const res = await fetch('http://127.0.0.1:7421/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args ?? {} } }),
  })
  return res.status
}
console.log('call with temp key:', await callTool('dashboard_overview', {}, tempKey))
console.log('revoke:', await evalIn(`window.zeus.apikeys.revoke(${JSON.stringify(keyId)}).then(r => JSON.stringify(r))`))
console.log('call with revoked key:', await callTool('dashboard_overview', {}, tempKey))
process.exit(0)
