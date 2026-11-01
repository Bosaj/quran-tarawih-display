import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pageFor } from '../components/AyahView.tsx'
import { ScreenBody } from '../components/ScreenBody.tsx'
import { buildCorpus, type CorpusFile } from './corpus.ts'
import { Engine, progressKey, readProgress } from './engine.ts'
import { STRINGS, statusLabel } from './i18n.ts'
import { INITIAL_SCREEN, type ScreenState } from './link.ts'
import { downsample, type Recognizer, type RecognizerEvents } from './recognizers.ts'
import { translationFor } from './useCorpus.ts'

const load = (id: string) => JSON.parse(readFileSync(`public/data/${id}.json`, 'utf8')) as CorpusFile
const corpus = buildCorpus(load('warsh'))
const hafs = buildCorpus(load('hafs'))
const index = (c: typeof corpus, s: number, a: number) => c.ayahs.findIndex((r) => r[0] === s && r[1] === a)

class FakeRecognizer implements Recognizer {
  events?: RecognizerEvents
  stopped = false
  async start(events: RecognizerEvents) {
    this.events = events
  }
  stop() {
    this.stopped = true
  }
}

const textOf = (s: number, a: number) => corpus.ayahs[index(corpus, s, a)]![4]

describe('Engine', () => {
  beforeEach(() => localStorage.clear())

  async function started() {
    const onChange = vi.fn()
    const engine = new Engine(onChange)
    engine.useCorpus(corpus)
    const rec = new FakeRecognizer()
    await engine.start(rec)
    return { engine, rec, onChange }
  }

  it('turns recogniser text into a verse on the screen', async () => {
    const { engine, rec } = await started()
    expect(engine.view.screen.status).toBe('searching')
    rec.events!.text(`${textOf(67, 1)} ${textOf(67, 2)}`)
    const row = corpus.ayahs[engine.view.screen.ayah]
    expect(row?.[0]).toBe(67)
    expect(engine.view.screen.status).toBe('locked')
    expect(engine.view.screen.token).toBeGreaterThan(0)
    expect(engine.view.heard).toContain('تبارك'.slice(0, 1))
  })

  it('remembers the running place for tomorrow, but not Al-Fatiha', async () => {
    const { rec } = await started()
    rec.events!.text(`${textOf(67, 1)} ${textOf(67, 2)}`)
    const saved = readProgress('warsh')
    expect(corpus.ayahs[saved!.ayah]?.[0]).toBe(67)
    rec.events!.text(`${textOf(1, 1)} ${textOf(1, 2)} ${textOf(1, 3)} ${textOf(1, 4)}`)
    expect(corpus.ayahs[readProgress('warsh')!.ayah]?.[0]).toBe(67)
    expect(localStorage.getItem(progressKey('warsh'))).toContain('"at"')
  })

  it('lets the technician correct by hand, and pause following', async () => {
    const { engine, rec } = await started()
    rec.events!.text(`${textOf(67, 1)} ${textOf(67, 2)}`)
    const here = engine.view.screen.ayah
    engine.command('next')
    expect(engine.view.screen.ayah).toBe(here + 1)
    engine.command('prev')
    engine.command('prev')
    expect(engine.view.screen.ayah).toBe(here - 1)
    engine.command('freeze')
    expect(engine.view.screen.status).toBe('frozen')
    rec.events!.text(`${textOf(36, 1)} ${textOf(36, 2)} ${textOf(36, 3)} ${textOf(36, 4)}`)
    expect(engine.view.screen.ayah).toBe(here - 1)
    engine.command('freeze')
    rec.events!.text(`${textOf(36, 1)} ${textOf(36, 2)} ${textOf(36, 3)} ${textOf(36, 4)} ${textOf(36, 5)}`)
    expect(corpus.ayahs[engine.view.screen.ayah]?.[0]).toBe(36)
  })

  it('blanks the screen and can stop', async () => {
    const { engine, rec } = await started()
    engine.command('blank')
    expect(engine.view.screen.blank).toBe(true)
    engine.command('blank')
    expect(engine.view.screen.blank).toBe(false)
    engine.stop()
    expect(rec.stopped).toBe(true)
    expect(engine.view.listening).toBe(false)
    expect(engine.view.screen.status).toBe('idle')
  })

  it('reports recogniser errors and stops', async () => {
    const { engine, rec } = await started()
    rec.events!.error('mic')
    expect(engine.view.error).toBe('mic')
    expect(engine.view.listening).toBe(false)
  })
})

describe('Display screen', () => {
  const state = (patch: Partial<ScreenState>): ScreenState => ({ ...INITIAL_SCREEN, ...patch })

  it('waits with the mosque name until a verse is found', () => {
    render(<ScreenBody corpus={corpus} state={state({ mosque: 'مسجد الأندلس' })} lang="ar" />)
    expect(screen.getByTestId('screen-idle')).toHaveTextContent('مسجد الأندلس')
    expect(screen.getByTestId('screen-idle')).toHaveTextContent(STRINGS.ar.idleTitle)
  })

  it('draws the verse unaltered, with surah, juz and page', () => {
    const i = index(corpus, 67, 1)
    const { container } = render(<ScreenBody corpus={corpus} state={state({ ayah: i, token: 2 })} lang="fr" />)
    const el = screen.getByTestId('screen-ayah')
    expect(el).toHaveAttribute('data-ref', '67:1')
    expect(el).toHaveTextContent('سورة')
    const shown = [...container.querySelectorAll('.ayah-box p span')].map((s) => s.textContent?.trim()).join(' ')
    expect(shown).toBe(corpus.ayahs[i]![4].split(/[\s ]+/u).filter(Boolean).join(' '))
    expect(container.querySelectorAll('.word-read')).toHaveLength(2)
    expect(container.querySelector('.ayah-box p')).toHaveClass('font-warsh')
  })

  it('shows nothing at all when blanked', () => {
    render(<ScreenBody corpus={corpus} state={state({ ayah: 5, blank: true })} lang="ar" />)
    expect(screen.getByTestId('screen-blank')).toBeEmptyDOMElement()
  })

  it('shows the next ayah when asked', () => {
    const i = index(corpus, 67, 1)
    const { container } = render(<ScreenBody corpus={corpus} state={state({ ayah: i, showNext: true })} lang="ar" />)
    expect(container.querySelector('.screen-next')?.textContent).toBe(corpus.ayahs[i + 1]![4])
  })
})

describe('Long ayat', () => {
  it('turn pages one word early', () => {
    const pages = [0, 40, 80]
    expect(pageFor(pages, 0)).toBe(0)
    expect(pageFor(pages, 38)).toBe(0)
    expect(pageFor(pages, 39)).toBe(1)
    expect(pageFor(pages, 90)).toBe(2)
  })
})

describe('Translations', () => {
  const verses = JSON.parse(readFileSync('public/data/tr-fr.json', 'utf8')) as string[]
  const warshToKufi = JSON.parse(readFileSync('public/data/warsh-kufi.json', 'utf8')) as [number, number][]
  const t = { verses, warshToKufi }

  it('line up with Hafs verse for verse', () => {
    expect(verses).toHaveLength(6236)
    expect(translationFor(t, 'hafs', index(hafs, 112, 1))).toContain('Allah')
    expect(translationFor(t, 'hafs', 0)).toBe(verses[0])
  })

  it('follow the Warsh verse division', () => {
    expect(warshToKufi).toHaveLength(6214)
    // Warsh 1:1 is "al-hamdu lillah": Hafs counts the Basmala first, so it is Hafs 1:2
    expect(warshToKufi[0]).toEqual([1, 1])
    // Warsh 2:1 joins Hafs 2:1 and 2:2
    const i = index(corpus, 2, 1)
    expect(warshToKufi[i]).toEqual([index(hafs, 2, 1), index(hafs, 2, 2)])
    expect(translationFor(t, 'warsh', i)).toBe(`${verses[index(hafs, 2, 1)]} ${verses[index(hafs, 2, 2)]}`)
  })

  it('never goes backward and covers every verse but the Basmala', () => {
    const seen = new Set<number>()
    warshToKufi.forEach(([a, b], i) => {
      expect(b).toBeGreaterThanOrEqual(a)
      if (i) expect(a).toBeGreaterThanOrEqual(warshToKufi[i - 1]![0])
      for (let k = a; k <= b; k++) seen.add(k)
    })
    expect(seen.size).toBe(6235)
    expect(seen.has(0)).toBe(false)
  })
})

describe('Audio and strings', () => {
  it('downsamples any sound card rate to 16 kHz', () => {
    const in48 = new Float32Array(4800).fill(0.5)
    const out = downsample(in48, 48000)
    expect(out).toHaveLength(1600)
    expect(out[10]).toBeCloseTo(0.5)
    const same = new Float32Array(160)
    expect(downsample(same, 16000)).toBe(same)
  })

  it('has every string in all three languages', () => {
    const keys = Object.keys(STRINGS.ar).sort()
    expect(Object.keys(STRINGS.fr).sort()).toEqual(keys)
    expect(Object.keys(STRINGS.en).sort()).toEqual(keys)
    for (const lang of ['ar', 'fr', 'en'] as const) for (const k of keys) expect(STRINGS[lang][k as keyof typeof STRINGS.ar], `${lang}.${k}`).toBeTruthy()
  })

  it('names every status', () => {
    expect(statusLabel('locked', STRINGS.en)).toBe(STRINGS.en.statusLocked)
    expect(statusLabel('idle', STRINGS.fr)).toBe(STRINGS.fr.statusIdle)
  })
})
