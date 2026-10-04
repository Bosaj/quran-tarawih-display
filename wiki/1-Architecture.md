# 1. Architecture

1. Microphone captures the imam (push-to-start per rakʿah).
2. Streaming ASR transcribes Arabic audio in near real time.
3. Matcher aligns the partial transcript to the Quran corpus and resolves the current surah:ayah (handle repeats, pauses, qiraʾat variance).
4. A WebSocket pushes the current ayah index to the display client.
5. Display renders the ayah (large Uthmani text) + optional translation; auto-advances.

## Proposed stack
- Python (ASR): faster-whisper / Whisper, optional NVIDIA NeMo
- Quran text + ayah index: Tanzil / quran.com API (Uthmani script)
- Matching: streaming ASR output fuzzy/embedding-matched to the Quran corpus
- Display: small web app (React + WebSocket) full-screen on the TV
- Deployment target: Raspberry Pi image, mic in, HDMI out

## Open bases to fork
- [Real-Time-Quran-recitation-tracker-System](https://github.com/yayaiu6/Real-Time-Quran-recitation-tracker-System) — Whisper/NeMo word-level alignment + live display — almost exactly this idea; best fork base.
- [Quranic-Verse-Recognition](https://github.com/Abdelrahman47-code/Quranic-Verse-Recognition) — Whisper-based verse recognition.
- [awesome-islamic-open-source-apps](https://github.com/tarekeldeeb/awesome-islamic-open-source-apps) — Curated list of open Quran/Islamic projects and data sources.
