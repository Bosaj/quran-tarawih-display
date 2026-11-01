import { AyahView } from './AyahView.tsx'
import type { Corpus } from '../lib/corpus.ts'
import { STRINGS, type Lang } from '../lib/i18n.ts'
import type { ScreenState } from '../lib/link.ts'
import { translationFor, useTranslation } from '../lib/useCorpus.ts'

/** Eastern digits, as printed in the Mushaf. */
const arNum = (n: number) => n.toLocaleString('ar-MA-u-nu-arab', { useGrouping: false })

/** The content of a display screen: also shown small on the technician's page as a preview. */
export function ScreenBody({ corpus, state, lang, preview = false }: { corpus: Corpus | null; state: ScreenState; lang: Lang; preview?: boolean }) {
  const t = STRINGS[lang]
  const translation = useTranslation(state.translation)
  if (state.blank) return <div className="screen-body" data-testid="screen-blank" />
  const row = corpus && state.ayah >= 0 ? corpus.ayahs[state.ayah] : undefined
  const fontClass = corpus?.riwaya === 'hafs' ? 'font-hafs' : 'font-warsh'

  if (!corpus || !row) {
    return (
      <div className="screen-body items-center justify-center text-center" data-testid="screen-idle">
        {state.mosque && <p className="screen-mosque">{state.mosque}</p>}
        <p className="screen-idle-title">{t.idleTitle}</p>
      </div>
    )
  }

  const [s, a, page, juz, text] = row
  const surah = corpus.surahs[s - 1]
  const next = state.showNext ? corpus.ayahs[state.ayah + 1] : undefined
  const meaning = translation ? translationFor(translation, corpus.riwaya, state.ayah) : ''
  return (
    <div className="screen-body" data-testid="screen-ayah" data-ref={`${s}:${a}`}>
      <header className="screen-head" dir="rtl">
        <span className="screen-surah">سورة {surah?.ar}</span>
        <span className="screen-meta">
          الآية {arNum(a)} · الجزء {arNum(juz)} · الصفحة {arNum(page)}
        </span>
      </header>
      <main key={state.ayah} className="ayah-enter relative min-h-0 flex-1">
        <AyahView text={text} token={state.token} fontClass={fontClass} compact={preview} />
      </main>
      {meaning && (
        <p key={`m${state.ayah}`} className="screen-translation ayah-enter" dir="ltr" lang={state.translation}>
          {meaning}
        </p>
      )}
      {next && (
        <p className={`screen-next ${fontClass}`} dir="rtl" lang="ar">
          {next[4]}
        </p>
      )}
    </div>
  )
}
