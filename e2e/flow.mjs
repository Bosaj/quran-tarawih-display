// End-to-end check of the page flow: technician's page + display window, using the demo recogniser.
//   URL=http://localhost:5193/ CHROME=<path to chrome.exe> npm run e2e
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const URL_ = process.env.URL ?? 'http://localhost:5193/'
const OUT = process.env.OUT ?? 'e2e/out'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const results = []
const errors = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })
const panel = await ctx.newPage()
panel.on('pageerror', (e) => errors.push(String(e)))
panel.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await panel.goto(URL_, { waitUntil: 'networkidle' })

// the display window opens from the technician's page and starts idle
const [screen] = await Promise.all([ctx.waitForEvent('page'), panel.getByRole('button', { name: "Ouvrir l'écran d'affichage" }).click()])
screen.on('pageerror', (e) => errors.push(String(e)))
await screen.setViewportSize({ width: 1920, height: 1080 })
await screen.waitForLoadState('networkidle')
await panel.getByLabel('Nom de la mosquée').fill('Mosquée Al-Andalous')
await screen.getByTestId('screen-idle').waitFor()
check('idle screen shows the mosque name', (await screen.getByTestId('screen-idle').textContent()).includes('Mosquée Al-Andalous'))
await screen.screenshot({ path: `${OUT}/screen-idle.png` })

// demo: the verse appears and advances on both pages
await panel.getByRole('radio', { name: /Démonstration/ }).click()
await panel.getByRole('button', { name: "Démarrer l'écoute" }).click()
const verse = screen.getByTestId('screen-ayah')
await verse.waitFor({ timeout: 15000 })
const first = await verse.getAttribute('data-ref')
check('finds the place from recogniser text', first?.startsWith('67:'), first)
await screen.waitForFunction(() => {
  const r = document.querySelector('[data-testid=screen-ayah]')?.getAttribute('data-ref') ?? ''
  return Number(r.split(':')[1]) >= 3
}, undefined, { timeout: 60000 })
const later = await verse.getAttribute('data-ref')
check('follows the recitation forward', Number(later.split(':')[1]) >= 3, later)
check('preview matches the screen', (await panel.getByTestId('screen-ayah').getAttribute('data-ref')) === (await verse.getAttribute('data-ref')))
await screen.waitForTimeout(800)
await screen.screenshot({ path: `${OUT}/screen-warsh.png` })
await panel.screenshot({ path: `${OUT}/panel.png`, fullPage: true })
const fits = await screen.evaluate(() => {
  const p = document.querySelector('.ayah-box p')
  const box = document.querySelector('.ayah-box')
  return { size: parseFloat(getComputedStyle(p).fontSize), inside: p.scrollHeight <= box.clientHeight + 2 }
})
check('the verse fits the screen in large type', fits.inside && fits.size > 40, `${Math.round(fits.size)}px`)
const font = await screen.evaluate(() => getComputedStyle(document.querySelector('.ayah-box p')).fontFamily)
check('uses the Warsh font', font.includes('Warsh'), font)
check('Warsh font is loaded', await screen.evaluate(() => document.fonts.check('40px "KFGQPC Warsh"')))

// manual correction wins over recognition, and pausing keeps it there
await panel.getByRole('button', { name: 'Mettre le suivi en pause' }).click()
const before = Number((await verse.getAttribute('data-ref')).split(':')[1])
await panel.getByRole('button', { name: 'Verset suivant' }).click()
await screen.waitForTimeout(300)
const moved = Number((await verse.getAttribute('data-ref')).split(':')[1])
check('technician moves one ayah forward', moved === before + 1, `${before} → ${moved}`)
await screen.waitForTimeout(3000)
check('paused: recognition does not move it', Number((await verse.getAttribute('data-ref')).split(':')[1]) === moved)

// keyboard on the display window
await screen.keyboard.press('ArrowRight')
await screen.waitForTimeout(300)
check('arrow key on the screen goes back', Number((await verse.getAttribute('data-ref')).split(':')[1]) === moved - 1)

// blank
await panel.getByRole('button', { name: "Masquer l'écran" }).click()
await screen.getByTestId('screen-blank').waitFor()
check('screen can be blanked', true)
await panel.getByRole('button', { name: "Afficher l'écran" }).click()
await verse.waitFor()

// translation and next verse
await panel.getByRole('radio', { name: 'Français' }).click()
await panel.getByText('Afficher le verset suivant').click()
await screen.locator('.screen-translation').waitFor({ timeout: 10000 })
check('French translation shows', (await screen.locator('.screen-translation').textContent()).length > 10)
check('next ayah shows', (await screen.locator('.screen-next').textContent()).length > 5)
await screen.waitForTimeout(600)
await screen.screenshot({ path: `${OUT}/screen-translation.png` })
await panel.getByRole('radio', { name: 'Aucune' }).click()
await panel.getByText('Afficher le verset suivant').click()

// the other riwaya, and a very long ayah that pages instead of shrinking away
await panel.getByRole('button', { name: "Arrêter l'écoute" }).click()
await panel.getByRole('radio', { name: /^Hafs/ }).click()
await panel.getByRole('radio', { name: 'Choisir sourate et verset' }).click()
await panel.locator('.select-wrap select').last().selectOption('2')
await panel.getByRole('spinbutton').fill('282')
await panel.getByRole('button', { name: 'Afficher ce verset maintenant' }).click()
await screen.waitForFunction(() => document.querySelector('[data-testid=screen-ayah]')?.getAttribute('data-ref') === '2:282', undefined, { timeout: 15000 })
await screen.waitForTimeout(800)
const long = await screen.evaluate(() => {
  const p = document.querySelector('.ayah-box p')
  const box = document.querySelector('.ayah-box')
  return { size: parseFloat(getComputedStyle(p).fontSize), shown: p.querySelectorAll('span').length, inside: p.scrollHeight <= box.clientHeight + 2, family: getComputedStyle(p).fontFamily }
})
check('Al-Baqarah 282 (longest ayah) fits and is paged, in readable type', long.inside && long.size >= 60 && long.shown < 128, `${Math.round(long.size)}px, ${long.shown} words on the first page`)
check('uses the Hafs font', long.family.includes('Hafs'), long.family)
await screen.screenshot({ path: `${OUT}/screen-hafs-long.png` })

console.log(results.join('\n'))
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.filter((r) => !r.startsWith('INFO')).length} passed`)
console.log('page errors:', errors)
await browser.close()
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exit(1)
