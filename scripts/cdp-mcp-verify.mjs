// Enables MCP, generates an API key, and probes the HTTP endpoint.
async function getTargets() {
  const res = await fetch('http://127.0.0.1:9222/json/list')
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

await evalIn(`location.hash = '#/settings'`)
await new Promise((r) => setTimeout(r, 1500))
console.log('enable mcp:', await evalIn('window.zeus.mcp.setEnabled(true).then(r => JSON.stringify(r))'))
console.log('generate key:', await evalIn('window.zeus.apikeys.generate("integration test").then(r => JSON.stringify(r))'))
console.log('info:', (await evalIn('window.zeus.mcp.getInfo().then(r => JSON.stringify(r))')).slice(0, 200))

const genStr = await evalIn('window.zeus.apikeys.generate("integration test 2").then(r => r.ok ? r.result.key : "error " + JSON.stringify(r))')
const apiKey = String(genStr)
console.log('apiKey starts:', apiKey.startsWith('zv_'))

async function callTool(name, args, token) {
  const res = await fetch('http://127.0.0.1:7421/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args ?? {} } }),
  })
  const text = await res.text()
  return { status: res.status, body: text.slice(0, 400) }
}

console.log('list tools with key:', JSON.stringify(await callTool('dashboard_overview', {}, apiKey)).slice(0, 200))
console.log('overview with key:', JSON.stringify(await callTool('dashboard_overview', {}, apiKey)).slice(0, 300))
console.log('search with key:', JSON.stringify(await callTool('nlp_extract', { text: 'profile for test user, email test@example.com' }, apiKey)).slice(0, 300))
console.log('wrong key:', JSON.stringify(await callTool('dashboard_overview', {}, 'wrong')).slice(0, 100))
console.log('no key:', JSON.stringify(await fetch('http://127.0.0.1:7421/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => ({ status: r.status })) ).slice(0, 100))
process.exit(0)
