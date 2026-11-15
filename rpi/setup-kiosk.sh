#!/usr/bin/env bash
# Qur'an Tarawih Display — Mosque Raspberry Pi Kiosk Appliance Provisioning Script (#3)
# Target OS: Raspberry Pi OS Bookworm (64-bit) on Raspberry Pi 4 / 5
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/quran-tarawih-display}"
SERVICE_USER="${SERVICE_USER:-pi}"
PORT="${PORT:-8787}"
LAN_KEY="${LAN_KEY:-mosque-tarawih-kiosk}"

echo "[1/5] Installing Chromium kiosk, audio, and Wayland/X11 dependencies..."
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  chromium \
  unclutter \
  alsa-utils \
  pulseaudio \
  ca-certificates \
  curl \
  git

if ! command -v node >/dev/null 2>&1; then
  echo "[2/5] Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "[3/5] Building Qur'an Tarawih Display offline bundle in ${APP_DIR}..."
if [ ! -d "${APP_DIR}" ]; then
  sudo mkdir -p "${APP_DIR}"
  sudo chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
  git clone https://github.com/Bosaj/quran-tarawih-display.git "${APP_DIR}"
fi

cd "${APP_DIR}"
npm ci
npm run corpus:verify
npm run build

echo "[4/5] Installing systemd services for LAN relay and full-screen HDMI kiosk..."
sudo cp "${APP_DIR}/rpi/tarawih-lan.service" /etc/systemd/system/tarawih-lan.service
sudo cp "${APP_DIR}/rpi/tarawih-kiosk.service" /etc/systemd/system/tarawih-kiosk.service
sudo systemctl daemon-reload
sudo systemctl enable tarawih-lan.service
sudo systemctl enable tarawih-kiosk.service

echo "[5/5] Disabling Wi-Fi power management and HDMI blanking..."
if command -v iwconfig >/dev/null 2>&1; then
  sudo iwconfig wlan0 power off || true
fi

echo "Mosque Raspberry Pi kiosk setup complete."
echo "Display URL: http://localhost:${PORT}/?k=${LAN_KEY}#/screen?kiosk=1"
