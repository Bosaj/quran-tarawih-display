import type { Corpus } from './corpus.ts'
import { similarity, words as toWords } from './normalize.ts'

/**
 * Follows a recitation through the text. It is fed the most recent words heard (a rolling window
 * from any speech recogniser) and answers with the position it believes the imam has reached.
 *
 * Rules, in order of importance:
 *  - Never jump on weak evidence. A wrong verse on a mosque screen is worse than a verse that stays
 *    a few seconds too long, so when unsure the tracker holds the last verse.
 *  - Prefer continuity: the imam almost always goes on from where he was. Repeated phrases such as
 *    "فبأي آلاء ربكما تكذبان" resolve to the nearest occurrence ahead.
 *  - Each rak'ah opens with Al-Fatiha, then returns to where the recitation stopped.
 */

export type TrackerStatus = 'searching' | 'locked' | 'uncertain'

export interface TrackerState {
  status: TrackerStatus
  /** Index of the last word reached in corpus.words, or -1 before the first lock. */
  pos: number
  /** Index of the current ayah in corpus.ayahs, or -1. */
  ayah: number
  /** How well the latest words fit the text at `pos`, 0..1. */
  confidence: number
}

interface Fit {
  score: number
  end: number
  start: number
  matched: number
}

const WINDOW = 14
const WORD_MATCH = 0.7
/** Below this a word counts as a plain miss, however close it looks. */
const WORD_FLOOR = 0.5
const GAP_REFERENCE = 0.6 // the recogniser missed a word of the text
const GAP_HEARD = 0.75 // the recogniser produced a word that isn't in the text
const AHEAD = 70
const BEHIND = 30
const FOLLOW_SCORE = 0.5
const FOLLOW_WORDS = 3
const JUMP_BACK_WORDS = 5
const FIND_SCORE = 0.66
const FIND_WORDS = 5
const MARGIN = 0.06
const NEAR_BONUS = 0.08
const NEAR_WORDS = 400
const LOST_AFTER = 3
const FATIHA_WORDS = 3
const FATIHA_SCORE = 0.7

/** Words said aloud in prayer that are not part of the running recitation. */
const FILLERS = [
  'الله اكبر',
  'سمع الله لمن حمده',
  'ربنا ولك الحمد',
  'ربنا لك الحمد',
  'اعوذ بالله من الشيطان الرجيم',
  'بسم الله الرحمن الرحيم',
  'صدق الله العظيم',
  'السلام عليكم ورحمه الله',
  'امين',
].map(toWords)

export function dropFillers(heard: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < heard.length; i++) {
    const hit = FILLERS.find((f) => f.every((w, k) => heard[i + k] === w))
    if (hit) {
      i += hit.length - 1
      continue
    }
    out.push(heard[i]!)
  }
  return out
}

/**
 * Best placement of the heard words inside corpus.words[from, to): free to start and end anywhere,
 * tolerant of missed words, extra words, and one word heard as two (يا أيها / يأيها).
 * `prefer` nudges ties toward the position nearest it.
 */
export function fitWindow(corpus: Corpus, heard: string[], from: number, to: number, prefer?: number): Fit {
  const ref = corpus.words
  const lo = Math.max(0, from)
  const hi = Math.min(ref.length, to)
  const n = hi - lo
  const m = heard.length
  const none: Fit = { score: 0, end: -1, start: -1, matched: 0 }
  if (n <= 0 || m === 0) return none
  const width = n + 1
  const cost = new Float32Array((m + 1) * width)
  const start = new Int32Array((m + 1) * width)
  const hits = new Int16Array((m + 1) * width)
  for (let j = 0; j <= n; j++) start[j] = lo + j
  for (let i = 1; i <= m; i++) {
    const row = i * width
    const up = row - width
    const word = heard[i - 1]!
    cost[row] = cost[up]! + GAP_HEARD
    start[row] = lo
    for (let j = 1; j <= n; j++) {
      const target = ref[lo + j - 1]!
      const sim = similarity(word, target)
      let best = cost[up + j - 1]! + (sim < WORD_FLOOR ? 1 : 1 - sim)
      let prev = up + j - 1
      let got = sim >= WORD_MATCH ? 1 : 0
      const skipText = cost[row + j - 1]! + GAP_REFERENCE
      if (skipText < best) {
        best = skipText
        prev = row + j - 1
        got = 0
      }
      const skipHeard = cost[up + j]! + GAP_HEARD
      if (skipHeard < best) {
        best = skipHeard
        prev = up + j
        got = 0
      }
      if (i >= 2) {
        const joined = similarity(heard[i - 2]! + word, target)
        const merged = cost[up - width + j - 1]! + (joined < WORD_FLOOR ? 2 : 1 - joined)
        if (joined >= WORD_MATCH && merged < best) {
          best = merged
          prev = up - width + j - 1
          got = 1
        }
      }
      cost[row + j] = best
      start[row + j] = start[prev]!
      hits[row + j] = hits[prev]! + got
    }
  }
  const last = m * width
  let bestJ = -1
  let bestValue = Infinity
  for (let j = 1; j <= n; j++) {
    const nudge = prefer === undefined ? 0 : Math.abs(lo + j - 1 - prefer) * 0.002
    const value = cost[last + j]! + nudge
    if (value < bestValue) {
      bestValue = value
      bestJ = j
    }
  }
  if (bestJ < 0) return none
  return { score: Math.max(0, 1 - cost[last + bestJ]! / m), end: lo + bestJ - 1, start: start[last + bestJ]!, matched: hits[last + bestJ]! }
}

export class AyahTracker {
  private pos = -1
  /** Where the running recitation stands, kept while the imam recites Al-Fatiha. */
  private anchor = -1
  private misses = 0
  private confidence = 0
  private status: TrackerStatus = 'searching'
  private lastKey = ''
  private readonly fatihaEnd: number
  private readonly corpus: Corpus

  constructor(corpus: Corpus) {
    this.corpus = corpus
    this.fatihaEnd = (corpus.ayahStart[corpus.surahStart[2] ?? 0] ?? 0) - 1
  }

  get state(): TrackerState {
    return { status: this.status, pos: this.pos, ayah: this.pos < 0 ? -1 : (this.corpus.wordAyah[this.pos] ?? -1), confidence: this.confidence }
  }

  /** Show an ayah now: the technician's manual correction. */
  jumpTo(ayahIndex: number) {
    this.pos = this.corpus.ayahStart[ayahIndex] ?? 0
    if (this.pos > this.fatihaEnd) this.anchor = this.pos
    this.status = 'locked'
    this.confidence = 1
    this.misses = 0
    this.lastKey = ''
  }

  /** Remember where the recitation should resume, without showing anything until it is heard. */
  expectAt(ayahIndex: number) {
    this.reset()
    this.anchor = this.corpus.ayahStart[ayahIndex] ?? -1
  }

  reset() {
    this.pos = -1
    this.anchor = -1
    this.status = 'searching'
    this.confidence = 0
    this.misses = 0
    this.lastKey = ''
  }

  /** Give the latest words heard, as raw recogniser text. Safe to call on every partial result. */
  hear(text: string): TrackerState {
    const heard = dropFillers(toWords(text)).slice(-WINDOW)
    const key = heard.join(' ')
    if (key === this.lastKey || heard.length === 0) return this.state
    this.lastKey = key
    if (this.pos >= 0 && this.follow(heard)) return this.state
    if (this.pos < 0 && this.anchor >= 0) {
      const fit = fitWindow(this.corpus, heard, this.anchor - 4, this.anchor + AHEAD, this.anchor)
      if (fit.score >= FOLLOW_SCORE && fit.matched >= FOLLOW_WORDS + 1) {
        this.moveTo(fit)
        return this.state
      }
    }
    if (this.findFatiha(heard)) return this.state
    if (heard.length >= FIND_WORDS) this.find(heard)
    return this.state
  }

  private inFatiha(pos: number) {
    return pos >= 0 && pos <= this.fatihaEnd
  }

  /** Try to continue locally. Returns true when the words fit near the current position. */
  private follow(heard: string[]): boolean {
    const here = this.pos
    let fit = fitWindow(this.corpus, heard, here - BEHIND, here + AHEAD, here)
    // Near the end of Al-Fatiha the imam is about to return to where he stopped.
    if (this.inFatiha(here) && this.anchor >= 0) {
      const back = fitWindow(this.corpus, heard, this.anchor - 4, this.anchor + AHEAD, this.anchor)
      if (back.matched >= FOLLOW_WORDS && back.score > fit.score) fit = back
    }
    const needed = Math.min(FOLLOW_WORDS, heard.length)
    if (fit.score >= FOLLOW_SCORE && fit.matched >= needed) {
      // Going back means the imam repeated a passage: only believe it on stronger evidence.
      if (fit.end < here && !this.inFatiha(fit.end) && fit.matched < JUMP_BACK_WORDS) {
        this.confidence = fit.score
        return true
      }
      this.moveTo(fit)
      return true
    }
    this.misses++
    this.confidence = fit.score
    if (this.misses >= LOST_AFTER) this.status = 'uncertain'
    return false
  }

  /**
   * Al-Fatiha opens every rak'ah and is recited slowly, so a few seconds may hold only three or four of
   * its words: too few for a whole-text search, but enough given how certain it is to come.
   */
  private findFatiha(heard: string[]): boolean {
    if (this.inFatiha(this.pos)) return false
    const fit = fitWindow(this.corpus, heard, 0, this.fatihaEnd + 1)
    if (fit.matched < FATIHA_WORDS || fit.score < FATIHA_SCORE) return false
    this.moveTo(fit)
    return true
  }

  /** Search the whole text. Only moves on a clear winner. */
  private find(heard: string[]) {
    const { pairs } = this.corpus
    const seeds = new Set<number>()
    for (let i = 0; i + 1 < heard.length; i++) {
      for (const p of pairs.get(`${heard[i]} ${heard[i + 1]}`) ?? []) seeds.add(Math.floor((p - i) / 8) * 8)
    }
    if (seeds.size === 0) return
    const near = this.anchor >= 0 ? this.anchor : this.pos
    const fits: (Fit & { value: number })[] = []
    for (const seed of seeds) {
      const fit = fitWindow(this.corpus, heard, seed - 6, seed + heard.length + 14)
      if (fit.end < 0) continue
      const ahead = near < 0 ? -1 : fit.end - near
      const bonus = near >= 0 && ahead >= -BEHIND && ahead <= NEAR_WORDS ? NEAR_BONUS : 0
      fits.push({ ...fit, value: fit.score + bonus })
    }
    fits.sort((a, b) => b.value - a.value)
    const best = fits[0]
    if (!best || best.score < FIND_SCORE || best.matched < FIND_WORDS) return
    const rival = fits.find((f) => Math.abs(f.end - best.end) > 30)
    if (rival && best.value - rival.value < MARGIN) return // the same words occur elsewhere: wait for more
    this.moveTo(best)
  }

  private moveTo(fit: Fit) {
    this.pos = fit.end
    if (!this.inFatiha(fit.end)) this.anchor = fit.end
    this.status = 'locked'
    this.confidence = fit.score
    this.misses = 0
  }
}
