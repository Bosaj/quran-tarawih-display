# 2. Roadmap

- v0.1 — offline: match a recorded recitation file to ayah indices.
- v0.2 — live microphone streaming + current-ayah resolution.
- v0.3 — mosque display mode (full-screen web client) + Raspberry Pi image.
- v0.4 — multi-qiraʾat tolerance, translation toggle, Ramadan schedule mode.

## Notes for contributors / LLM agents
- Start from the yayaiu6 tracker repo; evaluate its alignment accuracy on Moroccan recitation before rewriting.
- The hard part is robust matching, not ASR: handle long pauses between ayat, verse repetition, and small recitation differences. Keep a sliding window of the last N recognized words and match against a flattened ayah-word index.
- Never ship a translation or Quran text file without verifying it against a trusted source (Tanzil/quran.com). Accuracy of the sacred text is non-negotiable — treat corpus integrity as a hard requirement and add a checksum test.
