import type { Corpus } from './corpus.ts'
import { INITIAL_SCREEN, type Command, type ScreenState } from './link.ts'
import type { Recognizer } from './recognizers.ts'
import { AyahTracker } from './tracker.ts'
import { readStored, writeStored } from './useStored.ts'

export interface EngineView {
  screen: ScreenState
  listening: boolean
  /** Model download progress, 0..1, or null when not downloading. */
  loading: number | null
  preparing: boolean
  level: number
  heard: string
  confidence: number
  error: 'mic' | 'speech' | 'model' | null
}

export interface Progress {
  ayah: number
  at: string
}

export const progressKey = (riwaya: string) => `tarawih:progress:${riwaya}`

/**
 * The technician's side: recogniser → tracker → screen state. Lives outside React so a screen update
 * never depends on a render. Manual corrections always win over recognition.
 */
export class Engine {
  private corpus: Corpus | null = null
  private tracker: AyahTracker | null = null
  private recognizer: Recognizer | null = null
  private frozen = false
  private readonly onChange: (v: EngineView) => void
  view: EngineView = { screen: INITIAL_SCREEN, listening: false, loading: null, preparing: false, level: 0, heard: '', confidence: 0, error: null }

  constructor(onChange: (v: EngineView) => void) {
    this.onChange = onChange
  }

  private update(patch: Partial<EngineView>) {
    this.view = { ...this.view, ...patch }
    this.onChange(this.view)
  }

  private screen(patch: Partial<ScreenState>) {
    this.update({ screen: { ...this.view.screen, ...patch } })
  }

  useCorpus(corpus: Corpus) {
    if (this.corpus === corpus) return
    this.corpus = corpus
    this.tracker = new AyahTracker(corpus)
    this.screen({ riwaya: corpus.riwaya, ayah: -1, token: 0 })
  }

  options(patch: Pick<Partial<ScreenState>, 'translation' | 'showNext' | 'mosque'>) {
    this.screen(patch)
  }

  /** Where tonight's recitation should pick up. */
  expect(ayah: number | null) {
    if (ayah === null) this.tracker?.reset()
    else this.tracker?.expectAt(ayah)
    this.screen({ ayah: -1, token: 0 })
  }

  async start(recognizer: Recognizer) {
    this.stop()
    this.recognizer = recognizer
    this.frozen = false
    this.update({ listening: true, preparing: true, loading: null, error: null, heard: '' })
    this.screen({ status: 'searching' })
    await recognizer.start({
      text: (text) => this.onText(text),
      loading: (progress) => this.update({ loading: progress, preparing: progress === null ? false : this.view.preparing }),
      level: (level) => this.update({ level, preparing: this.view.loading === null ? false : this.view.preparing }),
      error: (error) => {
        this.stop()
        this.update({ error })
      },
    })
  }

  stop() {
    this.recognizer?.stop()
    this.recognizer = null
    this.update({ listening: false, preparing: false, loading: null, level: 0 })
    this.screen({ status: 'idle' })
  }

  private onText(text: string) {
    const { corpus, tracker } = this
    if (!corpus || !tracker) return
    this.update({ heard: text, preparing: false })
    if (this.frozen) return
    const before = tracker.state.ayah
    const state = tracker.hear(text)
    this.update({ confidence: state.confidence })
    this.showTracker()
    // Remember the running place for tomorrow night; Al-Fatiha is repeated every rak'ah, so it isn't one.
    if (state.status === 'locked' && state.ayah !== before && corpus.ayahs[state.ayah]?.[0] !== 1) {
      writeStored(progressKey(corpus.riwaya), { ayah: state.ayah, at: new Date().toISOString() } satisfies Progress)
    }
  }

  private showTracker() {
    const { corpus, tracker } = this
    if (!corpus || !tracker) return
    const s = tracker.state
    this.screen({ ayah: s.ayah, token: s.pos < 0 ? 0 : (corpus.wordToken[s.pos] ?? 0) + 1, status: s.status })
  }

  command(command: Command) {
    const { corpus, tracker } = this
    if (command === 'blank') this.screen({ blank: !this.view.screen.blank })
    if (command === 'freeze') {
      this.frozen = !this.frozen
      if (this.frozen) this.screen({ status: 'frozen' })
      else if (this.recognizer) this.showTracker()
      else this.screen({ status: 'idle' })
    }
    if ((command === 'prev' || command === 'next') && corpus && tracker) {
      const here = this.view.screen.ayah
      const target = Math.max(0, Math.min(corpus.ayahs.length - 1, here < 0 ? 0 : here + (command === 'next' ? 1 : -1)))
      this.goTo(target)
    }
  }

  goTo(ayah: number) {
    this.tracker?.jumpTo(ayah)
    this.screen({ ayah, token: 0, status: this.frozen ? 'frozen' : this.recognizer ? 'locked' : 'idle' })
  }

  get isFrozen() {
    return this.frozen
  }
}

export const readProgress = (riwaya: string) => readStored<Progress | null>(progressKey(riwaya), null)
