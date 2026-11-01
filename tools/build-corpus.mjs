// Builds public/data/{warsh,hafs}.json and public/fonts from the King Fahd Complex (KFGQPC) data,
// pinned to one commit of its developer mirror and checked against SHA-256 hashes.
// The verse text is copied character for character: only surrounding spaces are trimmed.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { skeleton } from '../src/lib/normalize.ts'

const COMMIT = '281dbbe8eed1370daa5a023b6cd81655cbfd6473'
const BASE = `https://raw.githubusercontent.com/thetruetruth/quran-data-kfgqpc/${COMMIT}`

const SOURCES = {
  warsh: { data: 'warsh/data/warshData_v10.json', font: 'warsh/font/warsh.10.woff2', count: 6214, sura: 'sura_no', fontName: 'warsh.woff2', label: "Warsh 'an Nafi' (KFGQPC v10)" },
  hafs: { data: 'hafs/data/hafsData_v18.json', font: 'hafs/font/hafs.18.woff2', count: 6236, sura: 'sora', fontName: 'hafs.woff2', label: "Hafs 'an Asim (KFGQPC v18)" },
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const get = async (path) => Buffer.from(await (await fetch(`${BASE}/${path}`)).arrayBuffer())

mkdirSync('public/data', { recursive: true })
mkdirSync('public/fonts', { recursive: true })
const hashes = {}
const built = {}
for (const [id, s] of Object.entries(SOURCES)) {
  const raw = await get(s.data)
  const rows = JSON.parse(raw.toString('utf8'))
  if (rows.length !== s.count) throw new Error(`${id}: expected ${s.count} ayat, got ${rows.length}`)
  const surahs = []
  const ayahs = rows.map((r) => {
    const n = r[s.sura]
    if (!surahs[n - 1]) surahs[n - 1] = { n, ar: r.sura_name_ar?.trim() ?? r.sora_name_ar?.trim(), en: r.sura_name_en ?? r.sora_name_en, ayahs: 0 }
    surahs[n - 1].ayahs++
    return [n, r.aya_no, Number(r.page), r.jozz, r.aya_text.trim()]
  })
  writeFileSync(`public/data/${id}.json`, JSON.stringify({ riwaya: id, label: s.label, surahs, ayahs }))
  built[id] = ayahs
  const font = await get(s.font)
  writeFileSync(`public/fonts/${s.fontName}`, font)
  hashes[id] = { source: sha256(raw), font: sha256(font), text: sha256(ayahs.map((a) => a[4]).join('\n')) }
  console.log(id, ayahs.length, 'ayat', surahs.length, 'surahs')
}
// ---- Translations (Tanzil project, verbatim, Kufi verse order)
const TRANSLATIONS = { fr: 'fr.hamidullah', en: 'en.sahih' }
for (const [id, edition] of Object.entries(TRANSLATIONS)) {
  const d = await (await fetch(`https://api.alquran.cloud/v1/quran/${edition}`)).json()
  const verses = d.data.surahs.flatMap((s) => s.ayahs.map((a) => a.text.trim()))
  if (verses.length !== 6236) throw new Error(`${id}: ${verses.length} verses`)
  writeFileSync(`public/data/tr-${id}.json`, JSON.stringify(verses))
  console.log('translation', id, verses.length)
}

// ---- Warsh verses → the Kufi verses they overlap, so translations can follow the Warsh text.
// Walks both word streams surah by surah; the two riwayat differ in only a few words.
const skeletons = (text) => text.split(/[\s ]+/u).map(skeleton).filter(Boolean)
const streams = (ayahs) => {
  const bySurah = new Map()
  ayahs.forEach(([s, , , , text], i) => {
    const list = bySurah.get(s) ?? []
    for (const w of skeletons(text)) list.push({ w, i })
    bySurah.set(s, list)
  })
  return bySurah
}
const warshWords = streams(built.warsh)
const hafsWords = streams(built.hafs)
const ranges = built.warsh.map(() => [Infinity, -1])
for (const [s, ws] of warshWords) {
  // Hafs counts the Basmala as verse 1 of Al-Fatiha; Warsh doesn't number it.
  const hs = hafsWords.get(s).slice(s === 1 ? 4 : 0)
  let h = 0
  for (const { w, i } of ws) {
    let found = -1
    for (let k = h; k < Math.min(hs.length, h + 6); k++) {
      if (hs[k].w === w) {
        found = k
        break
      }
    }
    const at = found >= 0 ? found : Math.min(h, hs.length - 1)
    const kufi = hs[at].i
    ranges[i][0] = Math.min(ranges[i][0], kufi)
    ranges[i][1] = Math.max(ranges[i][1], kufi)
    h = found >= 0 ? found + 1 : h + 1
  }
}
writeFileSync('public/data/warsh-kufi.json', JSON.stringify(ranges))

writeFileSync('src/lib/corpus-hashes.json', JSON.stringify({ commit: COMMIT, ...hashes }, null, 2) + '\n')
