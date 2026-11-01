import { skeleton } from './normalize.ts'

export type RiwayaId = 'warsh' | 'hafs'

export interface Surah {
  n: number
  ar: string
  en: string
  ayahs: number
}

/** surah, ayah, mushaf page, juz, text exactly as published by the King Fahd Complex */
export type AyahRow = [number, number, number, number, string]

export interface CorpusFile {
  riwaya: RiwayaId
  label: string
  surahs: Surah[]
  ayahs: AyahRow[]
}

export interface Corpus extends CorpusFile {
  /** Skeleton of every word of the Qur'an, in order. */
  words: string[]
  /** For each word: index of its ayah in `ayahs`. */
  wordAyah: Int32Array
  /** For each ayah: index of its first word in `words` (one extra entry at the end). */
  ayahStart: Int32Array
  /** For each word: its place among the on-screen tokens of its ayah. */
  wordToken: Int32Array
  /** First ayah index of each surah number (1-based; entry 0 unused). */
  surahStart: number[]
  /** Every position of each pair of consecutive words, for searching the whole text. */
  pairs: Map<string, number[]>
}

/** Split an ayah into the tokens drawn on screen (verse number and signs stay in the flow). */
export const ayahTokens = (text: string) => text.split(/[\s ]+/u).filter(Boolean)

export function buildCorpus(file: CorpusFile): Corpus {
  const words: string[] = []
  const wordAyahList: number[] = []
  const wordTokenList: number[] = []
  const ayahStart = new Int32Array(file.ayahs.length + 1)
  const surahStart: number[] = [0]
  file.ayahs.forEach(([s, a, , , text], i) => {
    if (a === 1) surahStart[s] = i
    ayahStart[i] = words.length
    ayahTokens(text).forEach((token, t) => {
      const w = skeleton(token)
      if (!w) return
      words.push(w)
      wordAyahList.push(i)
      wordTokenList.push(t)
    })
  })
  ayahStart[file.ayahs.length] = words.length
  const pairs = new Map<string, number[]>()
  for (let i = 0; i + 1 < words.length; i++) {
    const key = `${words[i]} ${words[i + 1]}`
    const list = pairs.get(key)
    if (list) list.push(i)
    else pairs.set(key, [i])
  }
  return { ...file, words, wordAyah: Int32Array.from(wordAyahList), wordToken: Int32Array.from(wordTokenList), ayahStart, surahStart, pairs }
}
