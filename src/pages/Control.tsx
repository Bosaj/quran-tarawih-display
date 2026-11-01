import { ChevronLeft, ChevronRight, ExternalLink, EyeOff, Laptop, Mic, Pause, Play, PlayCircle, Radio, ShieldAlert, Square, Wifi } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ScreenBody } from '../components/ScreenBody.tsx'
import type { Corpus, RiwayaId } from '../lib/corpus.ts'
import { Engine, readProgress, type EngineView } from '../lib/engine.ts'
import { LANGS, STRINGS, statusLabel, type Lang } from '../lib/i18n.ts'
import { openLink, type Link, type TranslationId } from '../lib/link.ts'
import { DemoRecognizer, LocalRecognizer, SpeechRecognizer, speechSupported, type EngineId } from '../lib/recognizers.ts'
import { useCorpus } from '../lib/useCorpus.ts'
import { useStored } from '../lib/useStored.ts'

type StartMode = 'auto' | 'continue' | 'choose'

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="segmented">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className="segment">
          <span className="font-semibold">{o.label}</span>
          {o.hint && <span className="text-xs opacity-80">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-2">{label}</span>
      {children}
    </div>
  )
}

function EngineCard({ id, icon, title, hint, selected, onSelect }: { id: EngineId; icon: ReactNode; title: string; hint: string; selected: boolean; onSelect: (id: EngineId) => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={() => onSelect(id)} className="engine-card">
      <span className="engine-icon" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 text-start">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{hint}</span>
      </span>
    </button>
  )
}

/** The technician's page: choose the settings, start listening, correct by hand if needed. */
export function Control({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = STRINGS[lang]
  const [riwaya, setRiwaya] = useStored<RiwayaId>('tarawih:riwaya', 'warsh')
  const [engineId, setEngineId] = useStored<EngineId>('tarawih:engine', 'local')
  const [deviceId, setDeviceId] = useStored('tarawih:mic', '')
  const [mosque, setMosque] = useStored('tarawih:mosque', '')
  const [translation, setTranslation] = useStored<TranslationId>('tarawih:translation', 'none')
  const [showNext, setShowNext] = useStored('tarawih:showNext', false)
  const [startMode, setStartMode] = useState<StartMode>('auto')
  const [chosenSurah, setChosenSurah] = useState(1)
  const [chosenAyah, setChosenAyah] = useState(1)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const corpus = useCorpus(riwaya)
  const [view, setView] = useState<EngineView | null>(null)
  const link = useRef<Link | null>(null)
  const engine = useMemo(() => new Engine(setView), [])
  const current = view ?? engine.view

  // Keep every screen in step with the engine
  useEffect(() => {
    const l = openLink((m) => {
      if (m.type === 'hello') l.send({ type: 'state', state: engine.view.screen })
      if (m.type === 'command') engine.command(m.command)
    })
    link.current = l
    return () => {
      l.close()
      engine.stop()
    }
  }, [engine])
  useEffect(() => {
    link.current?.send({ type: 'state', state: current.screen })
  }, [current.screen])

  useEffect(() => {
    if (corpus) engine.useCorpus(corpus)
  }, [corpus, engine])
  useEffect(() => {
    engine.options({ translation, showNext, mosque })
  }, [engine, translation, showNext, mosque])

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => setMics(all.filter((d) => d.kind === 'audioinput' && d.label)))
      .catch(() => {})
  }, [current.listening])

  const progress = corpus ? readProgress(corpus.riwaya) : null
  const progressLabel = corpus && progress ? refLabel(corpus, progress.ayah) : null
  const surah = corpus?.surahs[chosenSurah - 1]

  const chosenIndex = () => (corpus?.surahStart[chosenSurah] ?? 0) + Math.min(chosenAyah, surah?.ayahs ?? 1) - 1

  const start = () => {
    if (!corpus) return
    if (startMode === 'continue' && progress) engine.expect(Math.min(corpus.ayahs.length - 1, progress.ayah + 1))
    else if (startMode === 'choose') engine.expect(chosenIndex())
    else engine.expect(null)
    void engine.start(engineId === 'local' ? new LocalRecognizer(deviceId) : engineId === 'speech' ? new SpeechRecognizer() : new DemoRecognizer())
  }

  const openScreen = () => window.open(`${location.pathname}#/screen`, 'tarawih-screen', 'popup,width=1280,height=720')
  const errorText = current.error === 'mic' ? t.micDenied : current.error === 'speech' ? t.speechMissing : current.error === 'model' ? t.modelFailed : null
  const frozen = current.screen.status === 'frozen'

  return (
    <div className="panel-page min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/favicon.svg" alt="" width="44" height="44" className="shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight sm:text-xl">{t.appName}</h1>
            <p className="truncate text-[13px] text-ink-2">{t.tagline}</p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Language" className="lang-switch">
          {LANGS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} onClick={() => setLang(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 pb-10 pt-2 sm:px-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label={t.openScreen} className="preview">
            <ScreenBody corpus={corpus} state={current.screen} lang={lang} preview />
          </section>

          <section className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="status" data-status={current.screen.status} role="status">
                <span className="status-dot" aria-hidden />
                {current.preparing && current.loading === null ? t.preparing : statusLabel(current.screen.status, t)}
                {engineId === 'demo' && current.listening && <span className="demo-chip">{t.demoNote}</span>}
              </p>
              {current.listening && (
                <div className="meter" role="img" aria-label={t.level}>
                  <span style={{ transform: `scaleX(${current.level})` }} />
                </div>
              )}
            </div>
            {current.loading !== null && (
              <div>
                <p className="text-sm">
                  {t.loadingModel} {Math.round(current.loading * 100)}% <span className="text-ink-2">({t.loadingModelOnce})</span>
                </p>
                <div className="progress mt-1.5" role="progressbar" aria-valuenow={Math.round(current.loading * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${current.loading * 100}%` }} />
                </div>
              </div>
            )}
            {errorText && (
              <p className="error" role="alert">
                <ShieldAlert aria-hidden size={18} className="shrink-0" />
                {errorText}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {current.listening ? (
                <button type="button" className="btn btn-stop" onClick={() => engine.stop()}>
                  <Square aria-hidden size={18} />
                  {t.stopListening}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={start} disabled={!corpus}>
                  <Play aria-hidden size={18} />
                  {t.startListening}
                </button>
              )}
              <button type="button" className="btn" onClick={openScreen}>
                <ExternalLink aria-hidden size={18} />
                {t.openScreen}
              </button>
            </div>
            <p className="text-[13px] text-ink-2">{t.openScreenHint}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" className="btn" onClick={() => engine.command('prev')} disabled={!corpus}>
                <ChevronRight aria-hidden size={18} className="rtl-flip" />
                {t.previous}
              </button>
              <button type="button" className="btn" onClick={() => engine.command('next')} disabled={!corpus}>
                {t.next}
                <ChevronLeft aria-hidden size={18} className="rtl-flip" />
              </button>
              <button type="button" className="btn" aria-pressed={current.screen.blank} onClick={() => engine.command('blank')}>
                <EyeOff aria-hidden size={18} />
                {current.screen.blank ? t.unblank : t.blank}
              </button>
              <button type="button" className="btn" aria-pressed={frozen} onClick={() => engine.command('freeze')}>
                <Pause aria-hidden size={18} />
                {frozen ? t.unfreeze : t.freeze}
              </button>
            </div>
            {current.heard && (
              <p className="heard">
                <span className="font-semibold text-ink-2">{t.heard}: </span>
                <span dir="rtl" lang="ar">
                  {current.heard}
                </span>
              </p>
            )}
          </section>
          <p className="notice">
            <ShieldAlert aria-hidden size={18} className="shrink-0" />
            {t.supervise}
          </p>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="card flex flex-col gap-4">
            <Field label={t.riwaya}>
              <Segmented
                label={t.riwaya}
                value={riwaya}
                onChange={setRiwaya}
                options={[
                  { id: 'warsh', label: t.warsh, hint: t.warshHint },
                  { id: 'hafs', label: t.hafs, hint: t.hafsHint },
                ]}
              />
            </Field>
            <Field label={t.listen}>
              <div role="radiogroup" aria-label={t.listen} className="flex flex-col gap-2">
                <EngineCard id="local" icon={<Laptop size={20} />} title={t.engineLocal} hint={t.engineLocalHint} selected={engineId === 'local'} onSelect={setEngineId} />
                <EngineCard id="speech" icon={<Wifi size={20} />} title={t.engineSpeech} hint={speechSupported() ? t.engineSpeechHint : t.speechMissing} selected={engineId === 'speech'} onSelect={setEngineId} />
                <EngineCard id="demo" icon={<PlayCircle size={20} />} title={t.engineDemo} hint={t.engineDemoHint} selected={engineId === 'demo'} onSelect={setEngineId} />
              </div>
            </Field>
            {engineId === 'local' && (
              <Field label={t.mic}>
                <label className="select-wrap">
                  <Mic aria-hidden size={18} />
                  <span className="sr-only">{t.mic}</span>
                  <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                    <option value="">{t.micDefault}</option>
                    {mics.map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </Field>
            )}
            <Field label={t.start}>
              <Segmented
                label={t.start}
                value={startMode}
                onChange={setStartMode}
                options={[
                  { id: 'auto', label: t.startAuto },
                  { id: 'continue', label: t.startContinue, hint: progressLabel ?? t.noProgress },
                  { id: 'choose', label: t.startChoose },
                ]}
              />
              {startMode === 'choose' && corpus && (
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <label className="select-wrap">
                    <span className="sr-only">{t.surah}</span>
                    <select
                      value={chosenSurah}
                      onChange={(e) => {
                        setChosenSurah(Number(e.target.value))
                        setChosenAyah(1)
                      }}
                    >
                      {corpus.surahs.map((s) => (
                        <option key={s.n} value={s.n}>
                          {s.n}. {lang === 'ar' ? s.ar : s.en}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="select-wrap">
                    <span className="sr-only">{t.ayah}</span>
                    <input type="number" min={1} max={surah?.ayahs ?? 1} value={chosenAyah} onChange={(e) => setChosenAyah(Math.max(1, Number(e.target.value) || 1))} />
                  </label>
                </div>
              )}
              {startMode === 'choose' && corpus && (
                <button type="button" className="btn" onClick={() => engine.goTo(chosenIndex())}>
                  {t.showNow}
                </button>
              )}
            </Field>
          </section>

          <section className="card flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-ink-2">{t.screenOptions}</h2>
            <label className="flex flex-col gap-1.5 text-sm">
              {t.mosqueName}
              <input className="text-input" value={mosque} placeholder={t.mosquePlaceholder} onChange={(e) => setMosque(e.target.value)} />
            </label>
            <Field label={t.translation}>
              <Segmented
                label={t.translation}
                value={translation}
                onChange={setTranslation}
                options={[
                  { id: 'none', label: t.translationNone },
                  { id: 'fr', label: t.translationFr },
                  { id: 'en', label: t.translationEn },
                ]}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showNext} onChange={(e) => setShowNext(e.target.checked)} className="size-4 accent-[var(--gold)]" />
              {t.showNext}
            </label>
          </section>

          <section className="card flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
              <Radio aria-hidden size={16} />
              {t.remote}
            </h2>
            <p className="text-[13px] leading-relaxed text-ink-2">{t.remoteHint}</p>
            <h2 className="mt-2 text-sm font-semibold text-ink-2">{t.sourcesTitle}</h2>
            <p className="text-[13px] leading-relaxed text-ink-2">{t.sourcesBody}</p>
          </section>
        </aside>
      </main>
    </div>
  )
}

const refLabel = (corpus: Corpus, ayah: number) => {
  const row = corpus.ayahs[ayah]
  return row ? `${corpus.surahs[row[0] - 1]?.ar} ${row[1]}` : null
}
