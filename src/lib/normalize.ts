/**
 * Spelling-tolerant word forms used only for matching what was heard against the text.
 * The Uthmani text shown on screen is never altered; this skeleton is thrown away after comparing.
 *
 * Uthmani script and everyday spelling differ mostly in alifs and hamza seats (ٱلْعَٰلَمِينَ / العالمين,
 * يُومِنُونَ / يؤمنون), so the skeleton drops every mark and alif and folds the seats.
 */

const STRIP = /[\p{M}\p{Lm}\p{Cf}ـءاٱ]/gu
const NOT_ARABIC = /[^ء-يٮ-ۓ]/gu

export function skeleton(word: string): string {
  return word
    .normalize('NFD') // أ إ آ ؤ ئ become a base letter + mark
    .replace(STRIP, '')
    .replace(/[ىی]/g, 'ي') // ى ی → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ک/g, 'ك') // ک → ك
    .replace(NOT_ARABIC, '')
}

/** Split any Arabic text into skeleton words, dropping verse numbers, signs and empties. */
export function words(text: string): string[] {
  return text
    .split(/[\s ]+/u)
    .map(skeleton)
    .filter(Boolean)
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length] ?? 0
}

/** Similarity of two skeleton words, 0..1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - editDistance(a, b) / longest
}
