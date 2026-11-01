// Measures the whole chain on real recitation: audio → Quran Whisper → tracker → verse on screen.
// Audio comes from EveryAyah (one file per ayah, cached outside the repo, never redistributed), so the
// true verse at every moment is known from the file lengths.
//
//   node tools/eval.mjs                       run every scenario
//   node tools/eval.mjs warsh-mulk            run one
//   EVAL_MODEL=... EVAL_WINDOW=8 EVAL_STEP=2  try other settings
//
// Transcripts are cached, so re-scoring after a tracker change takes seconds.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCorpus } from '../src/lib/corpus.ts'
import { AyahTracker } from '../src/lib/tracker.ts'

const CACHE = process.env.EVAL_CACHE ?? join(process.env.TEMP ?? '/tmp', 'tarawih-eval')
const MODEL = process.env.EVAL_MODEL ?? 'aaqibhabib/whisper-base-ar-quran-onnx'
const WINDOW = Number(process.env.EVAL_WINDOW ?? 8)
const STEP = Number(process.env.EVAL_STEP ?? 2)
const SR = 16000
/** Same cap as the app: a window holds far fewer tokens than this, more means the model is looping. */
const MAX_TOKENS = 96
mkdirSync(CACHE, { recursive: true })

const WARSH_A = 'warsh/warsh_ibrahim_aldosary_128kbps'
const WARSH_B = 'warsh/warsh_yassin_al_jazaery_64kbps'
const HAFS_A = 'Alafasy_128kbps'
const HAFS_B = 'Husary_128kbps'

/** Each part is [surah, fromAyah, toAyah], played in order, as in a real prayer. */
const SCENARIOS = {
  'warsh-mulk': { riwaya: 'warsh', reciter: WARSH_A, parts: [[67, 1, 30]] },
  'warsh-baqarah': { riwaya: 'warsh', reciter: WARSH_B, parts: [[2, 1, 25]] },
  'warsh-rakah': { riwaya: 'warsh', reciter: WARSH_A, parts: [[1, 1, 7], [2, 100, 110], [1, 1, 7], [2, 111, 118]] },
  'hafs-mulk': { riwaya: 'hafs', reciter: HAFS_A, parts: [[67, 1, 30]] },
  'hafs-rahman': { riwaya: 'hafs', reciter: HAFS_B, parts: [[55, 1, 40]] },
}

const pad = (n) => String(n).padStart(3, '0')

async function fetchAyah(reciter, s, a) {
  const dir = join(CACHE, reciter.replace(/\W+/g, '_'))
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${pad(s)}${pad(a)}.mp3`)
  if (!existsSync(file)) {
    const r = await fetch(`https://everyayah.com/data/${reciter}/${pad(s)}${pad(a)}.mp3`)
    if (!r.ok) throw new Error(`${reciter} ${s}:${a} HTTP ${r.status}`)
    writeFileSync(file, Buffer.from(await r.arrayBuffer()))
  }
  return file
}

function decode(file) {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
  return new Float32Array(out.buffer, out.byteOffset, out.length / 4)
}

async function loadScenario(sc) {
  const chunks = []
  const truth = [] // [startSec, endSec, surah, ayah]
  let t = 0
  for (const [s, from, to] of sc.parts) {
    for (let a = from; a <= to; a++) {
      const pcm = decode(await fetchAyah(sc.reciter, s, a))
      chunks.push(pcm)
      truth.push([t, t + pcm.length / SR, s, a])
      t += pcm.length / SR
    }
  }
  const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) {
    audio.set(c, o)
    o += c.length
  }
  return { audio, truth, duration: t }
}

let asr
async function transcribe(name, sc) {
  const key = createHash('sha1').update(JSON.stringify([sc, MODEL, WINDOW, STEP])).digest('hex').slice(0, 12)
  const cacheFile = join(CACHE, `${name}-${key}.json`)
  const { audio, truth, duration } = await loadScenario(sc)
  if (existsSync(cacheFile)) return { ...JSON.parse(readFileSync(cacheFile, 'utf8')), truth, duration }
  if (!asr) {
    const { pipeline } = await import('@huggingface/transformers')
    asr = await pipeline('automatic-speech-recognition', MODEL, { dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, device: 'cpu' })
  }
  const steps = []
  let spent = 0
  for (let end = STEP; end <= duration + STEP; end += STEP) {
    const to = Math.min(audio.length, Math.round(end * SR))
    const from = Math.max(0, to - WINDOW * SR)
    const started = performance.now()
    const r = await asr(audio.slice(from, to), { max_new_tokens: MAX_TOKENS }).catch(() => ({ text: '' }))
    const took = performance.now() - started
    spent += took
    steps.push({ t: end, text: r.text.trim(), ms: Math.round(took) })
    if (steps.length % 20 === 0) console.error(`  ${name}: ${Math.round(end)}/${Math.round(duration)}s, ${Math.round(spent / steps.length)} ms per window`)
  }
  writeFileSync(cacheFile, JSON.stringify({ steps }))
  return { steps, truth, duration }
}

const trueAt = (truth, t) => truth.find(([a, b]) => t >= a && t < b) ?? truth.at(-1)

/**
 * Scores by word position, not verse number: EveryAyah numbers every riwaya by the Kufi count, while
 * Warsh verses end elsewhere (67:9 splits differently), so verse labels alone would report false errors.
 * The true word at time t comes from the file lengths and the Kufi (Hafs) word counts, scaled to the
 * riwaya's word count for that surah. Within an ayah speech is assumed even, so this is good to a few words.
 */
function score(name, sc, { steps, truth, duration }) {
  const read = (id) => buildCorpus(JSON.parse(readFileSync(`public/data/${id}.json`, 'utf8')))
  const corpus = read(sc.riwaya)
  const kufi = sc.riwaya === 'hafs' ? corpus : read('hafs')
  const tracker = new AyahTracker(corpus)
  const surahWords = (c, s) => {
    const first = c.ayahStart[c.surahStart[s]]
    const next = s < 114 ? c.ayahStart[c.surahStart[s + 1]] : c.words.length
    return [first, next - first]
  }
  const trueWord = (t) => {
    const row = trueAt(truth, t)
    const [t0, t1, s, a] = row
    const i = kufi.surahStart[s] + a - 1
    const inAyah = Math.min(1, (t - t0) / (t1 - t0))
    const [kFirst, kCount] = surahWords(kufi, s)
    const kPos = kufi.ayahStart[i] + inAyah * (kufi.ayahStart[i + 1] - kufi.ayahStart[i]) - kFirst
    const [first, count] = surahWords(corpus, s)
    // Kufi counts the Basmala as the first 4 words of Al-Fatiha; Warsh doesn't number it.
    const skip = s === 1 && sc.riwaya === 'warsh' ? 4 : 0
    return { s, a, word: first + (Math.max(0, kPos - skip) / (kCount - skip)) * count }
  }
  const boundaries = sc.parts.length > 1 ? truth.filter((r, i) => i > 0 && r[2] !== truth[i - 1][2]).map((r) => r[0]) : []
  let firstLock = null
  let shown = 0
  let onVerse = 0
  let near = 0
  let wrong = 0
  let grace = 0
  const lags = []
  const wrongList = []
  const log = []
  for (const { t, text, ms } of steps) {
    const st = tracker.hear(text)
    if (st.ayah < 0) continue
    if (firstLock === null) firstLock = t
    const { s, word } = trueWord(Math.min(t, duration - 0.01))
    const here = corpus.ayahs[st.ayah]
    const lag = word - st.pos
    log.push({ t, ms, shown: `${here[0]}:${here[1]}`, lag: Math.round(lag), conf: Number(st.confidence.toFixed(2)), status: st.status, text })
    // Just after a change of surah the window still holds the previous passage.
    if (boundaries.some((b) => t >= b && t < b + WINDOW + 4)) {
      grace++
      continue
    }
    shown++
    lags.push(lag)
    const trueAyah = corpus.wordAyah[Math.max(0, Math.min(corpus.words.length - 1, Math.round(word)))]
    if (Math.abs(st.ayah - trueAyah) <= 0) onVerse++
    if (here[0] === s && Math.abs(st.ayah - trueAyah) <= 1) near++
    else {
      wrong++
      wrongList.push(`t=${t} showed ${here[0]}:${here[1]} true surah ${s} lag ${Math.round(lag)} words: ${text.slice(0, 60)}`)
    }
  }
  const pct = (n) => `${((100 * n) / Math.max(1, shown)).toFixed(1)}%`
  const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1]
  const res = {
    scenario: name,
    audio: `${Math.round(duration)}s`,
    firstLock: firstLock === null ? 'never' : `${firstLock}s`,
    rightVerse: pct(onVerse),
    withinOneVerse: pct(near),
    wrong: pct(wrong),
    medianLagWords: Math.round(med(lags) ?? 0),
    medianMs: med(steps.map((x) => x.ms)),
  }
  console.log(JSON.stringify(res))
  for (const w of wrongList.slice(0, 10)) console.log('   WRONG', w)
  writeFileSync(join(CACHE, `${name}-log.json`), JSON.stringify(log))
  return res
}

const only = process.argv[2]
const all = []
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only && only !== name) continue
  all.push(score(name, sc, await transcribe(name, sc)))
}
console.log(`model=${MODEL} window=${WINDOW}s step=${STEP}s`)
if (process.env.EVAL_JSON) writeFileSync(process.env.EVAL_JSON, JSON.stringify(all, null, 2))
