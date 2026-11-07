// Completes the first-run setup form with the caller-provided values and reports what happened.
const TARGET = 'http://127.0.0.1:9222'
const VALUE_NAME = process.argv[2] ?? ''
const VALUE_USER = process.argv[3] ?? ''
const VALUE_EMAIL = process.argv[4] ?? ''
const VALUE_PASSWORD = process.argv[5] ?? ''

async function getTargets() {
  const res = await fetch(`${TARGET}/json/list`)
  return res.json()
}
async function cdp(wsUrl, method, params, id = 1, timeoutMs = 10000) {
  const ws = new WebSocket(wsUrl)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout')), timeoutMs)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id, method, params: params ?? {} })))
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.id === id) {
        clearTimeout(timer); resolve(msg); ws.close()
      }
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

const setReactInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return 'missing:' + ${JSON.stringify(selector)}
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc.set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return 'set'
})()`

const clickByText = (text) => `(() => {
  const els = [...document.querySelectorAll('button')]
  const el = els.find((b) => b.textContent.replace(/\\s+/g, ' ').trim().toUpperCase().includes(${JSON.stringify(text.toUpperCase())}))
  if (!el) return 'missing button: ' + ${JSON.stringify(text)}
  el.click()
  return 'clicked'
})()`

console.log('step1 (intro):', await evalIn(clickByText('BEGIN INITIALIZATION')))
await new Promise((r) => setTimeout(r, 700))
console.log('name:', await evalIn(setReactInput('#su-name', VALUE_NAME)))
console.log('user:', await evalIn(setReactInput('#su-username', VALUE_USER)))
console.log('email:', await evalIn(setReactInput('#su-email', VALUE_EMAIL)))
console.log('pass:', await evalIn(setReactInput('#su-password', VALUE_PASSWORD)))
await new Promise((r) => setTimeout(r, 300))
console.log('submit:', await evalIn(clickByText('INITIALIZE VAULT')))
await new Promise((r) => setTimeout(r, 2500))
console.log('body:', await evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 800)'))
console.log('status:', await evalIn('window.zeus.setup.status().then(r => JSON.stringify(r))'))
process.exit(0)
