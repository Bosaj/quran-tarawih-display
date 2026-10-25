# Quran Tarawih Display

> Show the Qur'anic verse the imam is reciting, live on the mosque TV/projector during Tarawih, synced to his recitation.

**Status:** pre-alpha scaffold (no code yet). **Feasibility rating:** 8/10 — real gap, especially in Morocco.
**Author:** Oussama Elhadji (`@Bosaj`) <oussousselhadji@gmail.com>.

---

## Problem

During Tarawih the congregation cannot see which verse the imam is reciting. A screen that follows the recitation word-by-word and displays the current ayah (Arabic + optional translation) helps worshippers follow along, especially non-Arabic speakers and the hard of hearing.

## Why build it (gap analysis)

The concept exists (speech-recognition 'ayah trackers'), but it is not widespread, not standardized, and almost absent in Morocco. The gap is an affordable, plug-and-play unit a local mosque can set up on a cheap PC / Raspberry Pi + HDMI screen.

## Prior art & open bases to fork

- [Real-Time-Quran-recitation-tracker-System](https://github.com/yayaiu6/Real-Time-Quran-recitation-tracker-System) — Whisper/NeMo word-level alignment + live display — almost exactly this idea; best fork base.
- [Quranic-Verse-Recognition](https://github.com/Abdelrahman47-code/Quranic-Verse-Recognition) — Whisper-based verse recognition.
- [awesome-islamic-open-source-apps](https://github.com/tarekeldeeb/awesome-islamic-open-source-apps) — Curated list of open Quran/Islamic projects and data sources.

## Proposed architecture

1. Microphone captures the imam (push-to-start per rakʿah).
2. Streaming ASR transcribes Arabic audio in near real time.
3. Matcher aligns the partial transcript to the Quran corpus and resolves the current surah:ayah (handle repeats, pauses, qiraʾat variance).
4. A WebSocket pushes the current ayah index to the display client.
5. Display renders the ayah (large Uthmani text) + optional translation; auto-advances.

## Tech stack (proposed)

- Python (ASR): faster-whisper / Whisper, optional NVIDIA NeMo
- Quran text + ayah index: Tanzil / quran.com API (Uthmani script)
- Matching: streaming ASR output fuzzy/embedding-matched to the Quran corpus
- Display: small web app (React + WebSocket) full-screen on the TV
- Deployment target: Raspberry Pi image, mic in, HDMI out

## Roadmap

- v0.1 — offline: match a recorded recitation file to ayah indices.
- v0.2 — live microphone streaming + current-ayah resolution.
- v0.3 — mosque display mode (full-screen web client) + Raspberry Pi image.
- v0.4 — multi-qiraʾat tolerance, translation toggle, Ramadan schedule mode.

---

## For LLM agents & contributors continuing this project

This repo is a **scaffold**: README + standard files, no implementation yet. If you are an AI agent asked to "continue developing", read this section first.

- Start from the yayaiu6 tracker repo; evaluate its alignment accuracy on Moroccan recitation before rewriting.
- The hard part is robust matching, not ASR: handle long pauses between ayat, verse repetition, and small recitation differences. Keep a sliding window of the last N recognized words and match against a flattened ayah-word index.
- Never ship a translation or Quran text file without verifying it against a trusted source (Tanzil/quran.com). Accuracy of the sacred text is non-negotiable — treat corpus integrity as a hard requirement and add a checksum test.

**Ground rules:** keep this README in sync with reality as you build; prefer forking/reusing the bases above over greenfield code; write tests for anything correctness-critical; never commit secrets (see `.gitignore`); follow Conventional Commits (see `CONTRIBUTING.md`).

## Getting started

```bash
# nothing to run yet — this is a scaffold.
# npm install && npm run dev   # once code lands
```

## 📄 License
**Proprietary Cultural & Non-Commercial Educational License** — All Rights Reserved © 2026 Oussama Elhadji (`@Bosaj`) <[oussousselhadji@gmail.com](mailto:oussousselhadji@gmail.com)>.

Free for personal learning and mosque worship. Commercial resale, monetization, and sublicensing are strictly prohibited. See [LICENSE](LICENSE) for full terms.
