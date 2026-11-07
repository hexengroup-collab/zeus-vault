// Navigates to the B2B Contacts screen and reports table contents.
const TARGET = 'http://127.0.0.1:9222'
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
const PASS = process.argv[2] ?? ''
await evalIn(`location.hash = '#/unlock'`)
await new Promise((r) => setTimeout(r, 800))
await evalIn(`(() => { const el = document.querySelector('#unlock-password'); const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(el, ${JSON.stringify(PASS)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'set' })()`)
await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('UNSEAL VAULT')); if (b) { b.click(); return 'clicked' } return 'missing' })()`)
await new Promise((r) => setTimeout(r, 3000))
console.log('unlock body:', await evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 200)'))
await evalIn(`location.hash = '#/b2b'`)
await new Promise((r) => setTimeout(r, 2500))
console.log('body:', await evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 1500)'))
await evalIn(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.toUpperCase().includes('UNSEAL VAULT')); if (b) { b.click(); return 'unlock pending' } return 'not on unlock screen' })()`)
console.log('after unlock attempt:', await evalIn('document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 200)'))
console.log('hash:', await evalIn('location.hash'))
process.exit(0)
