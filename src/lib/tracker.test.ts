import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ayahTokens, buildCorpus, type Corpus, type CorpusFile } from './corpus.ts'
import hashes from './corpus-hashes.json'
import { similarity, skeleton, words } from './normalize.ts'
import { AyahTracker, dropFillers, fitWindow } from './tracker.ts'

const load = (id: string) => JSON.parse(readFileSync(`public/data/${id}.json`, 'utf8')) as CorpusFile

let warsh: Corpus
let hafs: Corpus
beforeAll(() => {
  warsh = buildCorpus(load('warsh'))
  hafs = buildCorpus(load('hafs'))
})

const ayahIndex = (c: Corpus, s: number, a: number) => c.ayahs.findIndex((r) => r[0] === s && r[1] === a)
const ref = (c: Corpus, i: number) => `${c.ayahs[i]?.[0]}:${c.ayahs[i]?.[1]}`
/** The words of a range of ayat. */
const spoken = (c: Corpus, s: number, from: number, to: number) => {
  const out: string[] = []
  for (let a = from; a <= to; a++) out.push(...words(c.ayahs[ayahIndex(c, s, a)]![4]))
  return out
}
/** Feed words the way a recogniser does: a rolling window that grows word by word. */
const recite = (t: AyahTracker, heard: string[], size = 12) => {
  for (let i = 1; i <= heard.length; i++) t.hear(heard.slice(Math.max(0, i - size), i).join(' '))
  return t.state
}

describe('the text', () => {
  it('is exactly what the King Fahd Complex published', () => {
    for (const id of ['warsh', 'hafs'] as const) {
      const text = load(id).ayahs.map((a) => a[4]).join('\n')
      expect(createHash('sha256').update(text).digest('hex'), id).toBe(hashes[id].text)
    }
  })

  it('has the right number of surahs and ayat for each riwaya', () => {
    expect(warsh.ayahs).toHaveLength(6214) // Madani count
    expect(hafs.ayahs).toHaveLength(6236) // Kufi count
    for (const c of [warsh, hafs]) {
      expect(c.surahs).toHaveLength(114)
      expect(c.surahs.reduce((n, s) => n + s.ayahs, 0)).toBe(c.ayahs.length)
    }
  })

  it('keeps a word-to-token link for drawing the current word', () => {
    const i = ayahIndex(warsh, 67, 1)
    const first = warsh.ayahStart[i]!
    expect(warsh.wordAyah[first]).toBe(i)
    expect(skeleton(ayahTokens(warsh.ayahs[i]![4])[warsh.wordToken[first]!]!)).toBe(warsh.words[first])
  })
})

describe('matching forms', () => {
  it('folds Uthmani and everyday spelling together', () => {
    expect(skeleton('اِ۬لْعَٰلَمِينَ')).toBe(skeleton('العالمين'))
    expect(skeleton('يُومِنُونَ')).toBe(skeleton('يؤمنون'))
    expect(skeleton('ٱلۡحَمۡدُ')).toBe(skeleton('الحمد'))
    expect(skeleton('هُدىٗ')).toBe(skeleton('هدى'))
    expect(skeleton('١٢')).toBe('')
    expect(similarity('لصلوه', 'لصله')).toBeGreaterThan(0.7)
  })

  it('ignores what is said in prayer outside the recitation', () => {
    expect(dropFillers(words('الله أكبر الحمد لله آمين'))).toEqual(words('الحمد لله'))
    expect(dropFillers(words('سمع الله لمن حمده'))).toEqual([])
    expect(dropFillers(words('بسم الله الرحمن الرحيم تبارك الذي'))).toEqual(words('تبارك الذي'))
  })
})

describe('placing heard words', () => {
  it('finds the exact end of a passage', () => {
    const i = ayahIndex(warsh, 67, 2)
    const start = warsh.ayahStart[i]!
    const heard = warsh.words.slice(start, start + 8)
    const fit = fitWindow(warsh, heard, start - 20, start + 40)
    expect(fit.end).toBe(start + 7)
    expect(fit.score).toBe(1)
    expect(fit.matched).toBe(8)
  })

  it('tolerates a missed word, a wrong word and one word split in two', () => {
    const i = ayahIndex(hafs, 2, 21) // يا أيها الناس اعبدوا ربكم...
    const start = hafs.ayahStart[i]!
    const t = hafs.words.slice(start, start + 9)
    const heard = [...words('يا أيها'), ...t.slice(1, 4), 'كلمه', ...t.slice(6)]
    const fit = fitWindow(hafs, heard, start - 10, start + 30)
    expect(fit.end).toBe(start + 8)
    expect(fit.score).toBeGreaterThan(0.5)
  })
})

describe('following the imam', () => {
  it('finds a passage from nothing and stays on it', () => {
    const t = new AyahTracker(warsh)
    const s = recite(t, spoken(warsh, 67, 1, 3))
    expect(s.status).toBe('locked')
    expect(ref(warsh, s.ayah)).toBe('67:3')
  })

  it('does not lock on a phrase found in many places', () => {
    const t = new AyahTracker(warsh)
    t.hear('إن الله على كل شيء قدير')
    expect(t.state.pos).toBe(-1)
    expect(t.state.status).toBe('searching')
  })

  it('walks through a surah ayah by ayah in Warsh and Hafs', () => {
    for (const c of [warsh, hafs]) {
      const t = new AyahTracker(c)
      const seen: string[] = []
      const heard = spoken(c, 78, 1, c.surahs[77]!.ayahs)
      for (let i = 1; i <= heard.length; i++) {
        t.hear(heard.slice(Math.max(0, i - 12), i).join(' '))
        if (t.state.ayah >= 0 && ref(c, t.state.ayah) !== seen.at(-1)) seen.push(ref(c, t.state.ayah))
      }
      const nums = seen.map((r) => Number(r.split(':')[1]))
      expect(seen.every((r) => r.startsWith('78:'))).toBe(true)
      expect(nums).toEqual([...nums].sort((a, b) => a - b)) // never goes backward
      expect(nums.at(-1)).toBe(c.surahs[77]!.ayahs)
    }
  })

  it('takes the next occurrence of a refrain (Ar-Rahman)', () => {
    const t = new AyahTracker(hafs)
    t.jumpTo(ayahIndex(hafs, 55, 14))
    const s = recite(t, spoken(hafs, 55, 14, 18))
    expect(ref(hafs, s.ayah)).toBe('55:18') // 55:13, 55:16 and 55:18 all read the same
  })

  it("goes to Al-Fatiha at a new rak'ah, then back to where the imam stopped", () => {
    const t = new AyahTracker(warsh)
    recite(t, spoken(warsh, 2, 100, 104))
    const before = t.state.ayah
    expect(ref(warsh, before)).toBe('2:104')
    const inFatiha = recite(t, ['سمع', 'الله', 'لمن', 'حمده', ...spoken(warsh, 1, 1, 7), 'امين'])
    expect(warsh.ayahs[inFatiha.ayah]?.[0]).toBe(1)
    const after = recite(t, spoken(warsh, 2, 105, 106))
    expect(ref(warsh, after.ayah)).toBe('2:106')
  })

  it('recognises a slow Al-Fatiha from a few words, as a window of a few seconds holds', () => {
    const t = new AyahTracker(warsh)
    recite(t, spoken(warsh, 2, 105, 109))
    t.hear('إياك نعبد وإياك نستعين')
    expect(ref(warsh, t.state.ayah)).toBe('1:4')
  })

  it('does not take everyday words for Al-Fatiha', () => {
    const t = new AyahTracker(warsh)
    recite(t, spoken(warsh, 67, 1, 4))
    const held = t.state.ayah
    t.hear('الحمد لله')
    t.hear('رب العالمين')
    expect(t.state.ayah).toBe(held)
  })

  it('holds the verse on noise instead of jumping', () => {
    const t = new AyahTracker(warsh)
    recite(t, spoken(warsh, 67, 1, 4))
    const held = t.state.ayah
    for (const noise of ['استووا صفوفكم يرحمكم', 'كلام لا علاقة له بالقران الكريم هنا', 'يا اخواني اغلقوا الهواتف من فضلكم جزاكم الله خيرا']) {
      t.hear(noise)
      expect(t.state.ayah).toBe(held)
    }
    expect(t.state.status).toBe('uncertain')
  })

  it('follows a repeated passage back only on solid evidence', () => {
    const t = new AyahTracker(warsh)
    recite(t, spoken(warsh, 67, 1, 8))
    expect(ref(warsh, t.state.ayah)).toBe('67:8')
    t.hear(spoken(warsh, 67, 7, 7).slice(0, 2).join(' '))
    expect(ref(warsh, t.state.ayah)).toBe('67:8') // two words aren't enough to go back
    const s = recite(t, spoken(warsh, 67, 7, 7))
    expect(ref(warsh, s.ayah)).toBe('67:7')
  })

  it('survives a recogniser that gets words wrong', () => {
    const t = new AyahTracker(hafs)
    const heard = spoken(hafs, 36, 1, 20)
      .map((w, i) => (i % 6 === 5 ? `${w}ه` : i % 11 === 10 ? 'كلام' : w))
      .filter((_, i) => i % 13 !== 12)
    const s = recite(t, heard)
    expect(ref(hafs, s.ayah)).toBe('36:20')
  })

  it('waits for the expected place without showing anything, and finds Al-Fatiha first', () => {
    const t = new AyahTracker(warsh)
    t.expectAt(ayahIndex(warsh, 2, 105))
    expect(t.state.ayah).toBe(-1)
    expect(warsh.ayahs[recite(t, spoken(warsh, 1, 1, 7)).ayah]?.[0]).toBe(1)
    expect(ref(warsh, recite(t, spoken(warsh, 2, 105, 106)).ayah)).toBe('2:106')
  })

  it('resumes at the expected place on few words, where a whole-text search would wait', () => {
    const t = new AyahTracker(warsh)
    t.expectAt(ayahIndex(warsh, 55, 13))
    const s = recite(t, spoken(warsh, 55, 13, 13))
    expect(warsh.ayahs[s.ayah]?.[0]).toBe(55)
    expect(warsh.ayahs[s.ayah]?.[1]).toBeLessThanOrEqual(14)
  })

  it('can be placed by hand', () => {
    const t = new AyahTracker(warsh)
    t.jumpTo(ayahIndex(warsh, 18, 1))
    expect(t.state.status).toBe('locked')
    expect(ref(warsh, t.state.ayah)).toBe('18:1')
    expect(ref(warsh, recite(t, spoken(warsh, 18, 1, 2)).ayah)).toBe('18:2')
  })
})
