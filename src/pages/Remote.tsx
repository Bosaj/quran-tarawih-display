import { ChevronLeft, ChevronRight, EyeOff, Pause } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { STRINGS, initialLang, statusLabel } from '../lib/i18n.ts'
import { openLink, type Command, type Link, type ScreenState } from '../lib/link.ts'
import { useCorpus } from '../lib/useCorpus.ts'

/** A phone in the technician's hand, reaching the mosque computer through `npm run lan`. */
export function Remote() {
  const t = STRINGS[initialLang()]
  const [state, setState] = useState<ScreenState | null>(null)
  const corpus = useCorpus(state?.riwaya ?? 'warsh')
  const link = useRef<Link | null>(null)

  useEffect(() => {
    const l = openLink((m) => {
      if (m.type === 'state') setState(m.state)
    })
    link.current = l
    l.send({ type: 'hello' })
    return () => l.close()
  }, [])

  const send = (command: Command) => link.current?.send({ type: 'command', command })
  const row = state && corpus && state.ayah >= 0 ? corpus.ayahs[state.ayah] : undefined

  return (
    <main className="panel-page mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">{t.remoteTitle}</h1>
      {!state && <p className="text-ink-2">{t.remoteWaiting}</p>}
      {state && (
        <>
          <section className="card text-center">
            <p className="text-2xl font-bold">{row ? `${corpus?.surahs[row[0] - 1]?.ar} ${row[1]}` : '—'}</p>
            <p className="mt-1 text-sm text-ink-2">{statusLabel(state.status, t)}</p>
          </section>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-big" onClick={() => send('prev')}>
              <ChevronRight aria-hidden size={22} className="rtl-flip" />
              {t.previous}
            </button>
            <button type="button" className="btn btn-big" onClick={() => send('next')}>
              {t.next}
              <ChevronLeft aria-hidden size={22} className="rtl-flip" />
            </button>
            <button type="button" className="btn btn-big" onClick={() => send('blank')} aria-pressed={state.blank}>
              <EyeOff aria-hidden size={20} />
              {state.blank ? t.unblank : t.blank}
            </button>
            <button type="button" className="btn btn-big" onClick={() => send('freeze')} aria-pressed={state.status === 'frozen'}>
              <Pause aria-hidden size={20} />
              {state.status === 'frozen' ? t.unfreeze : t.freeze}
            </button>
          </div>
        </>
      )}
    </main>
  )
}
