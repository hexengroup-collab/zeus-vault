// Drives the real login UI end to end and reports what rendered after authentication.
const TARGET = 'http://127.0.0.1:9222'
const USER = process.argv[2] ?? ''
const PASS = process.argv[3] ?? ''

async function getTargets() {
  const res = await fetch(`${TARGET}/json/list`)
  return res.json()
}
async function cdp(wsUrl, method, params, id = 1, timeoutMs = 12000) {
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
await new Promise((r) => setTimeout(r, 800))
const setInput = (id, value) => `(() => { const el = document.querySelector('#' + ${JSON.stringify(id)}); if (!el) return 'missing ' + ${JSON.stringify(id)}; const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`
console.log('user:', await evalIn(setInput('username', USER)))
console.log('pass:', await evalIn(setInput('password', PASS)))
console.log('click:', await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.toUpperCase().includes('AUTHENTICATE')); if (!b) return 'missing button'; b.click(); return 'clicked' })()`))
await new Promise((r) => setTimeout(r, 3500))
console.log('hash:', await evalIn('location.hash'))
console.log('body:', await evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 600)'))
console.log('appInfo:', await evalIn('window.zeus.session.appInfo().then(r => JSON.stringify(r))'))
process.exit(0)
