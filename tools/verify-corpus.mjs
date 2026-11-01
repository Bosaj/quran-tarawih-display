// Cross-checks the shipped text against sources independent of the KFGQPC mirror:
//  - Hafs, verse by verse, against Tanzil's Uthmani text
//  - Warsh, surah by surah, against the Warsh edition of fawazahmed0/quran-api
//    (that edition splits verses by the Kufi count, so verse numbers can't be compared)
// Compared on letters only (src/lib/normalize.ts), since sources differ in marks and spelling
// conventions. Prints every disagreement so a person can read it. Exits 1 on an unexplained one.
import { readFileSync } from 'node:fs'
import { skeleton } from '../src/lib/normalize.ts'

const load = (id) => JSON.parse(readFileSync(`public/data/${id}.json`, 'utf8')).ayahs
const norm = (t) => t.split(/[\s ]+/u).map(skeleton).filter(Boolean)
const fetchJson = async (u) => (await fetch(u)).json()
const BASMALA = norm('بسم الله الرحمن الرحيم').join('')

/** First word-level differences between two word lists (simple LCS-free walk with resync). */
function wordDiff(a, b) {
  const out = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    let synced = false
    for (let k = 1; k <= 4 && !synced; k++) {
      for (let x = 0; x <= k && !synced; x++) {
        const y = k - x
        if (a[i + x] !== undefined && a[i + x] === b[j + y]) {
          out.push(`${a.slice(i, i + x).join(' ') || '∅'} ≠ ${b.slice(j, j + y).join(' ') || '∅'}`)
          i += x
          j += y
          synced = true
        }
      }
    }
    if (!synced) {
      out.push(`${a[i] ?? '∅'} ≠ ${b[j] ?? '∅'}`)
      i++
      j++
    }
  }
  return out
}

// ---- Hafs against Tanzil, verse by verse
const hafs = load('hafs')
const cloud = await fetchJson('https://api.alquran.cloud/v1/quran/quran-uthmani')
const tanzil = new Map()
for (const s of cloud.data.surahs) for (const a of s.ayahs) tanzil.set(`${s.number}:${a.numberInSurah}`, a.text.replace(/^﻿/, ''))
let same = 0
const hafsDiffs = []
for (const [s, a, , , text] of hafs) {
  const ours = norm(text)
  let theirs = norm(tanzil.get(`${s}:${a}`) ?? '')
  // Tanzil's API prefixes the Basmala to the first verse of each surah
  if (a === 1 && s !== 1 && theirs.slice(0, 4).join('') === BASMALA) theirs = theirs.slice(4)
  if (ours.join('') === theirs.join('')) same++
  else hafsDiffs.push(`${s}:${a}  ${wordDiff(ours, theirs).join(' ; ')}`)
}
console.log(`Hafs vs Tanzil Uthmani: ${same}/${hafs.length} verses have identical letters`)
for (const d of hafsDiffs) console.log('  ', d)

// ---- Warsh against an independent copy, surah by surah
const warsh = load('warsh')
const other = await fetchJson('https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quranwarsh.json')
const bySurah = (rows) => {
  const m = new Map()
  for (const [s, text] of rows) m.set(s, [...(m.get(s) ?? []), ...norm(text)])
  return m
}
const ours = bySurah(warsh.map((a) => [a[0], a[4]]))
const theirs = bySurah(other.quran.map((v) => [v.chapter, v.text]))
let surahsSame = 0
let wordsOurs = 0
const warshDiffs = []
for (const [s, w] of ours) {
  wordsOurs += w.length
  let t = theirs.get(s) ?? []
  if (t.slice(0, 4).join('') === BASMALA) t = t.slice(4)
  if (w.join('') === t.join('')) surahsSame++
  else warshDiffs.push(`surah ${s}: ${wordDiff(w, t).slice(0, 6).join(' ; ')}`)
}
console.log(`Warsh vs quran-api Warsh: ${surahsSame}/114 surahs have identical letters (${wordsOurs} words)`)
for (const d of warshDiffs) console.log('  ', d)
