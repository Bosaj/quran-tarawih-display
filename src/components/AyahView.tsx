import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ayahTokens } from '../lib/corpus.ts'

/** Largest and smallest type, as a share of the box height. Below the minimum the ayah is paged. */
const MAX_RATIO = 0.3
const MIN_RATIO = 0.075

interface Fit {
  size: number
  /** Index of the first token of each page. */
  pages: number[]
}

/** The page holding a token, turning a word early so the reader isn't left at the bottom edge. */
export function pageFor(pages: number[], token: number): number {
  let page = 0
  for (let i = 0; i < pages.length; i++) if ((pages[i] ?? 0) <= token + 1) page = i
  return page
}

/**
 * The ayah, as large as the box allows. Words already recited are at full strength and those still
 * ahead slightly softer, so the congregation can see the place. An ayah too long to read at the
 * minimum size (Al-Baqarah 282) turns its pages as the imam reaches them.
 */
export function AyahView({ text, token, fontClass, compact = false }: { text: string; token: number; fontClass: string; compact?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLDivElement>(null)
  const tokens = useMemo(() => ayahTokens(text), [text])
  const [fit, setFit] = useState<Fit>({ size: 0, pages: [0] })
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 })
  const [fontsReady, setFontsReady] = useState(0)

  // The fit must be measured in the verse font: another font wraps differently
  useEffect(() => {
    let live = true
    const family = fontClass === 'font-hafs' ? 'KFGQPC Hafs' : 'KFGQPC Warsh'
    void document.fonts?.load(`40px "${family}"`).then(() => {
      if (live) setFontsReady((n) => n + 1)
    })
    return () => {
      live = false
    }
  }, [fontClass])

  useLayoutEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBoxSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBoxSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const p = probe.current
    if (!p || !boxSize.h || !boxSize.w) return
    const measure = (size: number, count: number, from = 0) => {
      p.style.fontSize = `${size}px`
      p.textContent = tokens.slice(from, from + count).join(' ')
      return p.scrollHeight
    }
    const max = boxSize.h * MAX_RATIO
    const min = boxSize.h * MIN_RATIO
    let lo = min
    let hi = max
    if (measure(min, tokens.length) <= boxSize.h) {
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2
        if (measure(mid, tokens.length) <= boxSize.h) lo = mid
        else hi = mid
      }
      setFit({ size: lo, pages: [0] })
      return
    }
    const pages = [0]
    let from = 0
    while (from < tokens.length) {
      let count = 1
      while (from + count < tokens.length && measure(min, count + 1, from) <= boxSize.h) count++
      from += count
      if (from < tokens.length) pages.push(from)
    }
    setFit({ size: min, pages })
  }, [tokens, boxSize, fontsReady])

  const page = pageFor(fit.pages, token)
  const from = fit.pages[page] ?? 0
  const to = fit.pages[page + 1] ?? tokens.length

  return (
    <div ref={box} className="ayah-box absolute inset-0 overflow-hidden">
      <div ref={probe} aria-hidden className={`ayah-text invisible absolute inset-x-0 top-0 ${fontClass}`} dir="rtl" />
      <p dir="rtl" lang="ar" className={`ayah-text ${fontClass} ${compact ? 'ayah-compact' : ''}`} style={{ fontSize: fit.size || undefined }}>
        {tokens.slice(from, to).map((t, i) => (
          <span key={from + i} className={from + i < token ? 'word-read' : 'word-ahead'}>
            {t}{' '}
          </span>
        ))}
      </p>
    </div>
  )
}
