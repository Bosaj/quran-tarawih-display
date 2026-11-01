import { useEffect, useRef, useState } from 'react'
import { ScreenBody } from '../components/ScreenBody.tsx'
import { initialLang } from '../lib/i18n.ts'
import { INITIAL_SCREEN, openLink, type Command, type Link, type ScreenState } from '../lib/link.ts'
import { useCorpus } from '../lib/useCorpus.ts'

/** The window on the projector. It only shows what the technician's page sends. */
export function Screen() {
  const [state, setState] = useState<ScreenState>(INITIAL_SCREEN)
  const corpus = useCorpus(state.riwaya)
  const link = useRef<Link | null>(null)
  const [idleCursor, setIdleCursor] = useState(false)

  useEffect(() => {
    const l = openLink((m) => {
      if (m.type === 'state') setState(m.state)
    })
    link.current = l
    l.send({ type: 'hello' })
    return () => l.close()
  }, [])

  useEffect(() => {
    const send = (command: Command) => link.current?.send({ type: 'command', command })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') void document.documentElement.requestFullscreen?.().catch(() => {})
      if (e.key === 'ArrowLeft') send('next') // the page reads right to left
      if (e.key === 'ArrowRight') send('prev')
      if (e.key === 'b' || e.key === 'B') send('blank')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  return (
    <div className={`screen h-dvh w-screen ${idleCursor ? 'cursor-none' : ''}`} onDoubleClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}>
      <ScreenBody corpus={corpus} state={state} lang={initialLang()} />
    </div>
  )
}
