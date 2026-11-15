export type KioskTheme = 'oled' | 'emerald' | 'mushaf'

export interface KioskConfig {
  kiosk: boolean
  theme: KioskTheme
  scale: number
  burnInProtection: boolean
  mosqueOverride?: string
}

const VALID_THEMES: readonly KioskTheme[] = ['oled', 'emerald', 'mushaf']

export function parseKioskConfig(search: string = typeof location !== 'undefined' ? location.search : '', hash: string = typeof location !== 'undefined' ? location.hash : ''): KioskConfig {
  const hashQueryIndex = hash.indexOf('?')
  const combinedQuery = hashQueryIndex >= 0 ? `${search}&${hash.slice(hashQueryIndex + 1)}` : search
  const params = new URLSearchParams(combinedQuery.replace(/^[?&]+/, ''))

  const kioskParam = params.get('kiosk')
  const kiosk = kioskParam === '1' || kioskParam === 'true'

  const rawTheme = (params.get('theme') ?? 'oled').toLowerCase() as KioskTheme
  const theme: KioskTheme = VALID_THEMES.includes(rawTheme) ? rawTheme : 'oled'

  const rawScale = Number(params.get('scale') ?? 100)
  const scale = Number.isFinite(rawScale) ? Math.min(150, Math.max(80, Math.round(rawScale))) : 100

  const burnInParam = params.get('burnin')
  const burnInProtection = burnInParam ? burnInParam !== '0' && burnInParam !== 'false' : true

  const mosqueOverride = params.get('mosque')?.trim() || undefined

  return {
    kiosk,
    theme,
    scale,
    burnInProtection,
    mosqueOverride,
  }
}

/**
 * Computes a gentle 1–2px pixel-shift offset every minute to protect mosque OLED/LED screens
 * during long Tarawih and Qiyam al-Layl prayers.
 */
export function computeBurnInOffset(minuteTick: number): { x: number; y: number } {
  const step = ((Math.floor(minuteTick) % 8) + 8) % 8
  const offsets: readonly [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 1],
    [1, 2],
    [0, 2],
    [-1, 2],
    [-2, 1],
    [-1, 0],
  ]
  const pair = offsets[step] ?? [0, 0]
  return { x: pair[0], y: pair[1] }
}

export function nextKioskTheme(current: KioskTheme): KioskTheme {
  const idx = VALID_THEMES.indexOf(current)
  return VALID_THEMES[(idx + 1) % VALID_THEMES.length] ?? 'oled'
}

export function buildKioskLaunchUrl(
  baseUrl: string,
  options: { key?: string | null; theme?: KioskTheme; scale?: number; mosque?: string } = {},
): string {
  const url = new URL(baseUrl, 'http://localhost:8787')
  if (options.key) url.searchParams.set('k', options.key)
  const hashParams = new URLSearchParams()
  hashParams.set('kiosk', '1')
  if (options.theme && options.theme !== 'oled') hashParams.set('theme', options.theme)
  if (options.scale && options.scale !== 100) hashParams.set('scale', String(options.scale))
  if (options.mosque?.trim()) hashParams.set('mosque', options.mosque.trim())
  url.hash = `/screen?${hashParams.toString()}`
  return url.toString()
}
