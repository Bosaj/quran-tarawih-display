import { useEffect, useState } from 'react'
import { buildCorpus, type Corpus, type CorpusFile, type RiwayaId } from './corpus.ts'
import type { TranslationId } from './link.ts'

const cache = new Map<RiwayaId, Promise<Corpus>>()

export function loadCorpus(riwaya: RiwayaId): Promise<Corpus> {
  let p = cache.get(riwaya)
  if (!p) {
    p = fetch(`/data/${riwaya}.json`)
      .then((r) => r.json() as Promise<CorpusFile>)
      .then(buildCorpus)
    cache.set(riwaya, p)
  }
  return p
}

export function useCorpus(riwaya: RiwayaId): Corpus | null {
  const [corpus, setCorpus] = useState<Corpus | null>(null)
  useEffect(() => {
    let live = true
    void loadCorpus(riwaya).then((c) => {
      if (live) setCorpus(c)
    })
    return () => {
      live = false
    }
  }, [riwaya])
  return corpus?.riwaya === riwaya ? corpus : null
}

/** Verse translations follow the Kufi count, so a Warsh ayah points to the Kufi ayat it overlaps. */
export interface Translation {
  verses: string[]
  warshToKufi: [number, number][]
}

const translations = new Map<string, Promise<Translation>>()

function loadTranslation(id: Exclude<TranslationId, 'none'>): Promise<Translation> {
  let p = translations.get(id)
  if (!p) {
    p = Promise.all([fetch(`/data/tr-${id}.json`).then((r) => r.json() as Promise<string[]>), fetch('/data/warsh-kufi.json').then((r) => r.json() as Promise<[number, number][]>)]).then(([verses, warshToKufi]) => ({ verses, warshToKufi }))
    translations.set(id, p)
  }
  return p
}

export function useTranslation(id: TranslationId): Translation | null {
  const [value, setValue] = useState<{ id: TranslationId; t: Translation } | null>(null)
  useEffect(() => {
    if (id === 'none') return
    let live = true
    void loadTranslation(id).then((t) => {
      if (live) setValue({ id, t })
    })
    return () => {
      live = false
    }
  }, [id])
  return value?.id === id ? value.t : null
}

/** The translation text for an ayah of the given riwaya. */
export function translationFor(t: Translation, riwaya: RiwayaId, ayah: number): string {
  if (riwaya === 'hafs') return t.verses[ayah] ?? ''
  const range = t.warshToKufi[ayah]
  if (!range) return ''
  return t.verses.slice(range[0], range[1] + 1).join(' ')
}
