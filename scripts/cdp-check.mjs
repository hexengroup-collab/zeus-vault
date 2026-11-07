// Drives the running app over the Chrome DevTools Protocol and prints diagnostics.
const TARGET = 'http://127.0.0.1:9222'

async function getTargets() {
  const res = await fetch(`${TARGET}/json/list`)
  return res.json()
}

async function cdp(wsUrl, method, params, id = 1, timeoutMs = 8000) {
  const ws = new WebSocket(wsUrl)
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP timeout for ' + method)), timeoutMs)
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id, method, params: params ?? {} }))
    })
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.id === id) {
        clearTimeout(timer)
        resolve(msg)
        ws.close()
      }
    })
    ws.addEventListener('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
  return result
}

const targets = await getTargets()
const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'))
if (!page) {
  console.log('NO PAGE TARGET FOUND. Targets:', JSON.stringify(targets, null, 2))
  process.exit(1)
}
console.log('PAGE:', page.title, page.url)

const evalIn = async (expr) => {
  const r = await cdp(page.webSocketDebuggerUrl, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails)
  return r.result?.result?.value
}

console.log('zeus type:', await evalIn('typeof window.zeus'))
console.log('zeus keys:', await evalIn('window.zeus ? Object.keys(window.zeus).join(",") : "missing"'))
console.log('boot state probe:', await evalIn(`new Promise((resolve) => {
  let tries = 0
  const check = () => {
    const text = document.body.innerText.replace(/\\s+/g, ' ').trim()
    if (text.length > 20 || tries++ > 20) return resolve(text.slice(0, 400))
    setTimeout(check, 250)
  }
  check()
})`))
console.log('setup status:', await evalIn(`window.zeus ? window.zeus.setup.status().then(r => JSON.stringify(r)) : 'no zeus'`))
process.exit(0)
