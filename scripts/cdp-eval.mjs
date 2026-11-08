// Evaluate an expression in the running app page. Usage: node scripts/cdp-eval.mjs '<js>'
const TARGET = 'http://127.0.0.1:9222'
const EXPR = process.argv[2] ?? ''

async function getTargets() {
  const res = await fetch(`${TARGET}/json/list`)
  return res.json()
}
async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  let seq = 0
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout')), 15000)
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(null) })
    ws.addEventListener('error', reject)
  })
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  const call = (method, params) =>
    new Promise((resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  await ready
  return { call, close: () => ws.close() }
}
async function cdp(wsUrl, method, params) {
  const s = await cdpSession(wsUrl)
  const r = await s.call(method, params)
  s.close()
  return r
}
const targets = await getTargets()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')
const r = await cdp(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true })
if (r.result?.exceptionDetails) {
  console.log('EXC:', r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  process.exit(1)
}
console.log(JSON.stringify(r.result?.result?.value, null, 1)?.slice(0, 3000))
