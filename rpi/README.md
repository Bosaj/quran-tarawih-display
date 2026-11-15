# Mosque Display Mode & Raspberry Pi Kiosk Appliance

This directory provides everything needed to run **Qur'an Tarawih Display** as a dedicated, zero-maintenance mosque HDMI appliance on a **Raspberry Pi 4 or Raspberry Pi 5** (or any Linux mini-PC).

## Features
- **Full-Screen Mosque Kiosk Client (`#/screen?kiosk=1`)**:
  - Auto-hides the cursor immediately on boot.
  - Prevents HDMI sleep / screen dimming via the Screen Wake Lock API and systemd DPMS overrides.
  - **OLED / LED Wall Burn-In Protection**: Gently shifts the viewport by 1–2px on a 60-second Lissajous cycle so static headers (`سورة ...`) never burn into mosque displays during 2+ hour Tarawih and Qiyam al-Layl prayers.
  - **Live Keyboard Shortcuts**:
    - `F`: Toggle full-screen mode
    - `T`: Cycle display themes (`oled` -> `emerald` -> `mushaf`)
    - `+` / `-`: Increase or decrease verse font scale (`80%` to `150%`) for distant prayer rows
    - `B`: Blank / unblank screen during Rak'ah transitions or Khatm Du'a
    - `←` / `→`: Next / previous ayah override

## One-Command Raspberry Pi Setup

On a fresh **Raspberry Pi OS Bookworm (64-bit)** installation:

```bash
curl -fsSL https://raw.githubusercontent.com/Bosaj/quran-tarawih-display/main/rpi/setup-kiosk.sh | bash
```

Or from a cloned repository:

```bash
bash rpi/setup-kiosk.sh
```

## Architecture on the Pi
1. **`tarawih-lan.service`**: Starts `tools/lan-server.mjs` on port `8787` at boot, serving the verified King Fahd Complex Hafs & Warsh corpora and relaying commands over WebSocket (`/link`).
2. **`tarawih-kiosk.service`**: Launches Chromium in `--kiosk` mode on the mosque projector / TV HDMI output (`http://localhost:8787/?k=mosque-tarawih-kiosk#/screen?kiosk=1&theme=oled`).
3. **Technician & Imam Phone Remote**: Any authorized phone or tablet on the mosque Wi-Fi can open the pairing link to control or supervise the recitation live.
