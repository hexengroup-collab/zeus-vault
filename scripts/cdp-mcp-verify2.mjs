// Verifies the live MCP endpoint using a user-supplied API key.
const TARGET = 'http://127.0.0.1:9222'
const KEY = process.argv[2] ?? ''
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

console.log('enable mcp:', (await evalIn('window.zeus.mcp.setEnabled(true).then(r => JSON.stringify(r))')).slice(0, 120))
await new Promise((r) => setTimeout(r, 2500))
console.log('server info:', (await evalIn('window.zeus.mcp.getInfo().then(r => JSON.stringify(r))')).slice(0, 300))

async function callTool(name, args, token, id = 1) {
  const res = await fetch('http://127.0.0.1:7421/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args ?? {} } }),
  })
  const text = await res.text()
  return { status: res.status, body: text.slice(0, 900) }
}

console.log('users_list (proves role walk):', JSON.stringify(await callTool('users_list', {})))
console.log('dashboard_overview with supplied key:', JSON.stringify(await callTool('dashboard_overview', {}, KEY)).slice(0, 500))
console.log('wrong key:', JSON.stringify(await callTool('dashboard_overview', {}, 'zv_wrong_wrong')).slice(0, 160))
process.exit(0)
