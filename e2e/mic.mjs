// The real chain in a real browser: a recitation played into Chromium's microphone → AudioWorklet →
// Web Worker → Quran Whisper (onnxruntime-web) → tracker → display window. Downloads the model once.
//   URL=... CHROME=... WAV=recitation.wav EXPECT=67 node e2e/mic.mjs
// Make the WAV with ffmpeg at 48 kHz mono, from EveryAyah files. Audio is not kept in the repo.
import { chromium } from 'playwright'

const URL_ = process.env.URL ?? 'http://localhost:5193/'
const WAV = process.env.WAV
const SURAH = process.env.EXPECT ?? '67'
const MINUTES = Number(process.env.MINUTES ?? 6)
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}`, '--autoplay-policy=no-user-gesture-required', ...(process.env.GPU ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] : [])],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', permissions: ['microphone'] })
const panel = await ctx.newPage()
const errors = []
panel.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
panel.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300))
  if (m.type() === 'warning' && /whisper/.test(m.text())) console.log('warn', m.text().slice(0, 200))
})
panel.on('worker', () => console.log('worker started'))
await panel.goto(URL_, { waitUntil: 'networkidle' })
const [screen] = await Promise.all([ctx.waitForEvent('page'), panel.getByRole('button', { name: 'Open the display screen' }).click()])
await screen.waitForLoadState('networkidle')
await panel.getByRole('radio', { name: /On this computer/ }).click()
const t0 = Date.now()
await panel.getByRole('button', { name: 'Start listening' }).click()

let lastLoad = -1
let locked = null
const seen = []
const deadline = t0 + MINUTES * 60_000
let heard = ''
while (Date.now() < deadline) {
  await panel.waitForTimeout(1000)
  const pct = await panel.locator('[role=progressbar]').getAttribute('aria-valuenow').catch(() => null)
  if (pct !== null && Number(pct) >= lastLoad + 20) {
    lastLoad = Number(pct)
    console.log(`model download ${pct}% after ${Math.round((Date.now() - t0) / 1000)}s`)
  }
  const ref = await screen.locator('[data-testid=screen-ayah]').getAttribute('data-ref', { timeout: 200 }).catch(() => null)
  heard = (await panel.locator('.heard').textContent({ timeout: 200 }).catch(() => '')) ?? ''
  if (ref && ref !== seen.at(-1)) {
    seen.push(ref)
    if (!locked) locked = Math.round((Date.now() - t0) / 1000)
    console.log(`${Math.round((Date.now() - t0) / 1000)}s  screen shows ${ref}`)
    await screen.screenshot({ path: process.env.SHOT ?? 'mic-screen.png' })
  }
  if (seen.length >= Number(process.env.VERSES ?? 5)) break
}
console.log('first verse after', locked, 's; verses seen:', seen.join(' '))
console.log('last heard:', heard.slice(0, 120))
const right = seen.length > 0 && seen.every((r) => r.startsWith(`${SURAH}:`))
console.log(right && seen.length >= 3 ? 'PASS: followed the recitation through the microphone' : 'FAIL')
console.log('page errors:', errors.slice(0, 5))
await browser.close()
if (!right || seen.length < 3) process.exit(1)
