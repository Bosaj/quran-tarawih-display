/** Speech sources. Each gives the tracker a rolling window of the words heard most recently. */

export type EngineId = 'local' | 'speech' | 'demo'

export interface RecognizerEvents {
  text(text: string): void
  /** Download progress 0..1, then null when ready. */
  loading(progress: number | null): void
  /** Sound level 0..1 for the meter. */
  level(value: number): void
  error(kind: 'mic' | 'speech' | 'model'): void
}

export interface Recognizer {
  start(events: RecognizerEvents): Promise<void>
  stop(): void
}

const SAMPLE_RATE = 16000

/** Average down to 16 kHz, whatever rate the sound card runs at. */
export function downsample(input: Float32Array, rate: number): Float32Array {
  if (rate === SAMPLE_RATE) return input
  const ratio = rate / SAMPLE_RATE
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio)
    const to = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = from; j < to; j++) sum += input[j]!
    out[i] = sum / Math.max(1, to - from)
  }
  return out
}

/** The Quran Whisper model, running in a Web Worker on this device. */
export class LocalRecognizer implements Recognizer {
  private worker?: Worker
  private stream?: MediaStream
  private context?: AudioContext
  private readonly deviceId: string

  constructor(deviceId: string) {
    this.deviceId = deviceId
  }

  async start(events: RecognizerEvents) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: this.deviceId ? { exact: this.deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      })
    } catch {
      events.error('mic')
      return
    }
    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = (e: MessageEvent<{ type: string; progress?: number; text?: string }>) => {
      const m = e.data
      if (m.type === 'progress') events.loading(m.progress ?? 0)
      if (m.type === 'ready') events.loading(null)
      if (m.type === 'text' && m.text) events.text(m.text)
      if (m.type === 'failed') events.error('model')
    }
    worker.postMessage({ type: 'init' })
    const context = new AudioContext()
    this.context = context
    await context.audioWorklet.addModule('/capture-worklet.js')
    const source = context.createMediaStreamSource(this.stream)
    const capture = new AudioWorkletNode(context, 'capture', { numberOfOutputs: 0 })
    capture.port.onmessage = (e: MessageEvent<Float32Array>) => {
      let sum = 0
      for (const v of e.data) sum += v * v
      events.level(Math.min(1, Math.sqrt(sum / e.data.length) * 6))
      const pcm = downsample(e.data, context.sampleRate)
      worker.postMessage({ type: 'audio', pcm }, [pcm.buffer])
    }
    source.connect(capture)
    await context.resume()
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.context?.close().catch(() => {})
    this.worker?.terminate()
  }
}

interface SpeechResult {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechEngine {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SpeechCtor = new () => SpeechEngine

export const speechSupported = () =>
  typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: SpeechCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition)

/** The browser's own speech service (Chrome, Edge). Needs the internet. */
export class SpeechRecognizer implements Recognizer {
  private engine?: SpeechEngine
  private running = false

  async start(events: RecognizerEvents) {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      events.error('speech')
      return
    }
    const engine = new Ctor()
    this.engine = engine
    this.running = true
    engine.lang = 'ar-SA' // Standard Arabic reads recitation far better than a dialect model
    engine.continuous = true
    engine.interimResults = true
    engine.maxAlternatives = 1
    let finals: string[] = []
    engine.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!
        if (r.isFinal) finals.push(r[0].transcript)
        else interim += ` ${r[0].transcript}`
      }
      finals = finals.slice(-4)
      events.text(`${finals.join(' ')} ${interim}`.trim().split(/\s+/).slice(-16).join(' '))
    }
    engine.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.running = false
        events.error('mic')
      }
    }
    // The service stops itself after a silence; keep it going for the whole prayer.
    engine.onend = () => {
      if (this.running) engine.start()
    }
    engine.start()
  }

  stop() {
    this.running = false
    this.engine?.stop()
  }
}

/** Replays real recogniser output from a recording (text only), so anyone can try the screen. */
export class DemoRecognizer implements Recognizer {
  private timer?: ReturnType<typeof setTimeout>
  private readonly speed: number

  constructor(speed = 3) {
    this.speed = speed
  }

  async start(events: RecognizerEvents) {
    const demo = (await (await fetch('/demo/mulk.json')).json()) as { steps: { t: number; text: string }[] }
    let i = 0
    const play = () => {
      const step = demo.steps[i++]
      if (!step) {
        i = 0
        this.timer = setTimeout(play, 4000)
        return
      }
      events.text(step.text)
      events.level(0.25 + Math.random() * 0.3)
      const next = demo.steps[i]
      this.timer = setTimeout(play, ((next ? next.t - step.t : 2) * 1000) / this.speed)
    }
    play()
  }

  stop() {
    clearTimeout(this.timer)
  }
}
