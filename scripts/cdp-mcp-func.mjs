// Unlock via UI, enable MCP, generate key, probe endpoints.
const TARGET = 'http://127.0.0.1:9222'
const PASS = process.argv[2] ?? ''
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

await evalIn(`location.hash = '#/unlock'`)
await new Promise((r) => setTimeout(r, 900))
await evalIn(`(() => { const el = document.querySelector('#unlock-password'); const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(PASS)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`)
await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('UNSEAL VAULT')); if (b) b.click() })()`)
await new Promise((r) => setTimeout(r, 3500))

console.log('enable mcp:', (await evalIn('window.zeus.mcp.setEnabled(true).then(r => JSON.stringify(r))')).slice(0, 120))
await new Promise((r) => setTimeout(r, 2600))
console.log('info:', (await evalIn('window.zeus.mcp.getInfo().then(r => JSON.stringify(r))')).slice(0, 320))

const kc = await evalIn('window.zeus.apikeys.generate("audit verification").then(r => JSON.stringify(r))')
console.log('keys generate:', kc.slice(0, 300))
const key = JSON.parse(kc)
const apiKey = key.ok && key.result ? key.result.key : ''
console.log('key captured:', !!apiKey)

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
  return { status: res.status, body: (await res.text()).slice(0, 500) }
}

console.log('tools/list:', JSON.stringify(await fetch('http://127.0.0.1:7421/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }).then(r => ({ status: r.status, body: r.status }))).slice(0, 200))
console.log('dashboard_overview:', JSON.stringify(await callTool('dashboard_overview', {}, apiKey)).slice(0, 300))
console.log('nlp_extract:', JSON.stringify(await callTool('nlp_extract', { text: 'profile for test user, email test@example.com' }, apiKey)).slice(0, 300))
console.log('profiles_search:', JSON.stringify(await callTool('profiles_search', { query: 'people from Bangladesh' }, apiKey)).slice(0, 300))
console.log('wrong key:', JSON.stringify(await callTool('dashboard_overview', {}, 'zv_wrong_wrong')).slice(0, 150))
console.log('no key:', JSON.stringify(await fetch('http://127.0.0.1:7421/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => ({ status: r.status })) ).slice(0, 150))
console.log('malformed:', JSON.stringify(await fetch('http://127.0.0.1:7421/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: '{broken' }).then(r => ({ status: r.status })) ).slice(0, 150))
process.exit(0)
