// The phone remote through `npm run lan`: separate browser contexts stand in for separate devices,
// so a BroadcastChannel can't connect them and only the WebSocket relay can.
//   npm run build && npm run lan        (in another terminal)
//   URL=http://localhost:8787/ CHROME=... node e2e/lan.mjs
import { chromium } from 'playwright'

const URL_ = process.env.URL ?? 'http://localhost:8787/'
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const results = []
const errors = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
const device = async (hash, viewport) => {
  const ctx = await browser.newContext({ viewport, locale: 'en-US', serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.on('websocket', (ws) => {
    if (process.env.DEBUG) {
      ws.on('framesent', (f) => console.log(hash || 'laptop', 'sent', String(f.payload).slice(0, 90)))
      ws.on('framereceived', (f) => console.log(hash || 'laptop', 'got ', String(f.payload).slice(0, 90)))
    }
  })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  await page.goto(`${URL_}${hash}`, { waitUntil: 'networkidle' })
  return page
}

const laptop = await device('', { width: 1280, height: 800 })
const screen = await device('#/screen', { width: 1280, height: 720 })
const phone = await device('#/remote', { width: 390, height: 844 })

await laptop.getByRole('button', { name: 'Next ayah' }).click() // puts the first verse on screen
await screen.getByTestId('screen-ayah').waitFor({ timeout: 10000 })
check('a screen on another device receives the verse', true, await screen.getByTestId('screen-ayah').getAttribute('data-ref'))

const ref = () => screen.getByTestId('screen-ayah').getAttribute('data-ref')
const before = await ref()
await phone.getByRole('button', { name: 'Next ayah' }).click()
await screen.waitForFunction((b) => document.querySelector('[data-testid=screen-ayah]')?.getAttribute('data-ref') !== b, before, { timeout: 5000, polling: 200 })
check('the phone moves the verse forward', true, `${before} → ${await ref()}`)
await phone.getByRole('button', { name: 'Hide the screen' }).click()
await screen.getByTestId('screen-blank').waitFor({ timeout: 5000 })
check('the phone hides the screen', true)
await phone.getByRole('button', { name: 'Show the screen' }).click()
await screen.getByTestId('screen-ayah').waitFor({ timeout: 5000 })
check('the phone shows it again', true)
check('the phone shows where the imam is', (await phone.locator('.card').first().textContent()).length > 3, await phone.locator('.card').first().textContent())
await phone.screenshot({ path: process.env.SHOT ?? 'remote.png' })

// A remote that joins late still learns the state
const late = await device('#/remote', { width: 390, height: 844 })
await late.getByRole('button', { name: 'Next ayah' }).waitFor({ timeout: 5000 })
check('a late remote catches up', true)

console.log(results.join('\n'))
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`)
console.log('page errors:', errors)
await browser.close()
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exit(1)
