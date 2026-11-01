import { useEffect, useState } from 'react'
import { initialLang, STRINGS, type Lang } from './lib/i18n.ts'
import { writeStored } from './lib/useStored.ts'
import { Control } from './pages/Control.tsx'
import { Remote } from './pages/Remote.tsx'
import { Screen } from './pages/Screen.tsx'

const route = () => location.hash.replace(/^#\/?/, '')

export function App() {
  const [page, setPage] = useState(route)
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = (l: Lang) => {
    setLangState(l)
    writeStored('tarawih:lang', l)
  }

  useEffect(() => {
    const onHash = () => setPage(route())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.title = STRINGS[lang].appName
  }, [lang])

  if (page === 'screen') return <Screen />
  if (page === 'remote') return <Remote />
  return <Control lang={lang} setLang={setLang} />
}
