# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-01
### Added
- The app itself, replacing the scaffold's Python stub: a technician's page, a projector screen and a phone remote, in Arabic, French and English.
- Warsh and Hafs text and fonts from the King Fahd Complex, pinned by commit and SHA-256, checked in a test and cross-checked against independent copies (`npm run corpus:verify`).
- A tracker that follows the recitation, holds the verse when unsure, resolves repeated refrains to the next occurrence, goes to Al-Fatiha at each rak'ah and returns to the running place.
- Recognition on the device with Tarteel's Quran-trained Whisper (WebGPU or WebAssembly, offline after one download), or through the browser's speech service. A text-only demo needs no microphone.
- Large type fitted to the screen, with paging for very long ayat; translations in French and English, mapped onto the Warsh verse division; continue from last night; manual corrections; `npm run lan` for a phone remote.
- `npm run eval` measures the whole chain on real recitations.

### Changed
- CI now fails when tests or the build fail.

### Removed
- The Python timestamp stub, which matched no real audio.

## [0.1.0] - 2026-10-18
### Added
- Initial repository scaffold: README (with architecture, roadmap and an LLM-handoff section), LICENSE, .gitignore, CONTRIBUTING, issue/PR templates, and wiki pages.
