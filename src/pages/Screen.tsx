import { useEffect, useRef, useState } from 'react'
import { ScreenBody } from '../components/ScreenBody.tsx'
import { initialLang } from '../lib/i18n.ts'
import { computeBurnInOffset, nextKioskTheme, parseKioskConfig, type KioskTheme } from '../lib/kiosk.ts'
import { INITIAL_SCREEN, openLink, type Command, type Link, type ScreenState } from '../lib/link.ts'
import { useCorpus } from '../lib/useCorpus.ts'

/** The window on the projector or Raspberry Pi kiosk HDMI output. It only shows what the technician's page sends. */
export function Screen() {
  const initialKiosk = parseKioskConfig()
  const [state, setState] = useState<ScreenState>(() =>
    initialKiosk.mosqueOverride ? { ...INITIAL_SCREEN, mosque: initialKiosk.mosqueOverride } : INITIAL_SCREEN,
  )
  const [theme, setTheme] = useState<KioskTheme>(initialKiosk.theme)
  const [scale, setScale] = useState<number>(initialKiosk.scale)
  const [minuteTick, setMinuteTick] = useState(0)
  const corpus = useCorpus(state.riwaya)
  const link = useRef<Link | null>(null)
  const [idleCursor, setIdleCursor] = useState(initialKiosk.kiosk)

  useEffect(() => {
    const l = openLink((m) => {
      if (m.type === 'state') {
        setState((prev) => ({
          ...m.state,
          mosque: m.state.mosque || initialKiosk.mosqueOverride || prev.mosque,
        }))
      }
    })
    link.current = l
    l.send({ type: 'hello' })
    return () => l.close()
  }, [initialKiosk.mosqueOverride])

  useEffect(() => {
    const send = (command: Command) => link.current?.send({ type: 'command', command })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') void document.documentElement.requestFullscreen?.().catch(() => {})
      if (e.key === 'ArrowLeft') send('next') // the page reads right to left
      if (e.key === 'ArrowRight') send('prev')
      if (e.key === 'b' || e.key === 'B') send('blank')
      if (e.key === 't' || e.key === 'T') setTheme((cur) => nextKioskTheme(cur))
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(150, s + 5))
      if (e.key === '-' || e.key === '_') setScale((s) => Math.max(80, s - 5))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Gentle pixel shift every 60s when burn-in protection is active
  useEffect(() => {
    if (!initialKiosk.burnInProtection) return
    const interval = setInterval(() => setMinuteTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [initialKiosk.burnInProtection])

  // A display must not dim or sleep in the middle of a rak'ah
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null
    const take = () => {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
      wl?.request('screen')
        .then((l) => {
          lock = l
        })
        .catch(() => {})
    }
    take()
    const again = () => {
      if (document.visibilityState === 'visible') take()
    }
    document.addEventListener('visibilitychange', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      void lock?.release().catch(() => {})
    }
  }, [])

  // No mouse pointer over the verse
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const moved = () => {
      setIdleCursor(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdleCursor(true), 2500)
    }
    moved()
    window.addEventListener('pointermove', moved)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', moved)
    }
  }, [])

  const offset = initialKiosk.burnInProtection ? computeBurnInOffset(minuteTick) : { x: 0, y: 0 }

  return (
    <div
      data-kiosk={initialKiosk.kiosk ? 'true' : 'false'}
      data-theme={theme}
      style={{
        fontSize: scale !== 100 ? `${scale}%` : undefined,
        transform: offset.x !== 0 || offset.y !== 0 ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
      }}
      className={`screen h-dvh w-screen ${idleCursor ? 'cursor-none' : ''}`}
      onDoubleClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}
    >
      <ScreenBody corpus={corpus} state={state} lang={initialLang()} />
    </div>
  )
}
