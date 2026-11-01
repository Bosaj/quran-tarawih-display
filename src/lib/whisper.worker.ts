/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

/**
 * Runs Tarteel's Quran-trained Whisper (Apache-2.0) on this device. It listens to a rolling window of
 * the last few seconds, as often as the machine can manage. Model files are cached by the browser
 * after the first download, so the app then works without internet.
 */

const MODEL = 'aaqibhabib/whisper-base-ar-quran-onnx'
/** Pinned, so a later change to that repository can't change what mosques run. */
const REVISION = 'fbf6820f87babc9ead58282a52c48c3577b50b77'
const SAMPLE_RATE = 16000
const WINDOW = 8 * SAMPLE_RATE
const STEP = 1.5 * SAMPLE_RATE
/** Whisper invents words on silence, so a quiet window is never sent to it. */
const SILENCE_RMS = 0.004
/** Eight seconds holds far fewer tokens than this. Past it the model is looping, and it can crash. */
const MAX_TOKENS = 96

env.allowLocalModels = false

type Transcriber = (audio: Float32Array, options: { max_new_tokens: number }) => Promise<{ text: string } | { text: string }[]>

const ring = new Float32Array(WINDOW)
let filled = 0
let fresh = 0
let busy = false
let transcribe: Transcriber | null = null

function push(pcm: Float32Array) {
  if (pcm.length >= WINDOW) {
    ring.set(pcm.subarray(pcm.length - WINDOW))
    filled = WINDOW
  } else {
    ring.copyWithin(0, pcm.length)
    ring.set(pcm, WINDOW - pcm.length)
    filled = Math.min(WINDOW, filled + pcm.length)
  }
  fresh += pcm.length
}

function rms(a: Float32Array) {
  let sum = 0
  for (const v of a) sum += v * v
  return Math.sqrt(sum / Math.max(1, a.length))
}

async function pump() {
  if (busy || !transcribe || fresh < STEP) return
  busy = true
  fresh = 0
  try {
    const audio = ring.slice(WINDOW - filled)
    if (rms(audio) >= SILENCE_RMS) {
      const r = await transcribe(audio, { max_new_tokens: MAX_TOKENS })
      const text = (Array.isArray(r) ? r[0]?.text : r.text)?.trim()
      if (text) postMessage({ type: 'text', text })
    }
  } catch (err) {
    console.error(err)
  }
  busy = false
  void pump()
}

async function init() {
  // Download progress across the model's files, weighted by their size
  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file && p.total) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      postMessage({ type: 'progress', progress: loaded / total })
    }
  }
  const gpu = 'gpu' in navigator && !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null))
  const attempts = gpu
    ? [
        { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' } },
        { device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
      ]
    : [{ device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } }]
  for (const attempt of attempts) {
    try {
      const options = { ...attempt, revision: REVISION, progress_callback } as unknown as Parameters<typeof pipeline>[2]
      transcribe = (await pipeline('automatic-speech-recognition', MODEL, options)) as unknown as Transcriber
      postMessage({ type: 'ready', device: attempt.device })
      void pump()
      return
    } catch (err) {
      console.warn(`whisper on ${attempt.device} failed`, err)
    }
  }
  postMessage({ type: 'failed' })
}

self.onmessage = (e: MessageEvent<{ type: 'init' } | { type: 'audio'; pcm: Float32Array }>) => {
  if (e.data.type === 'init') void init()
  else {
    push(e.data.pcm)
    void pump()
  }
}
