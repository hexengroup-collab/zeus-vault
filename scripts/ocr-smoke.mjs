import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

const svg = Buffer.from(`<svg width="440" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="440" height="120" fill="white"/><text x="20" y="75" font-size="42" font-family="monospace" fill="black">ZEUS VAULT</text></svg>`)
await sharp(svg).png().toFile('C:/Users/LENOVO/AppData/Local/Temp/opencode/ocr-test.png')
console.log('img ok')

const worker = await createWorker('eng', 1, {
  langPath: 'D:/zeus-vault/resources/ocr',
  gzip: false,
  logger: () => {},
})
const { data } = await worker.recognize('C:/Users/LENOVO/AppData/Local/Temp/opencode/ocr-test.png')
console.log('OCR:', JSON.stringify(data.text.trim()))
await worker.terminate()
