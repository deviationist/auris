#!/usr/bin/env bash
set -euo pipefail

# Auris — system setup script
# Run with: npm run setup (or ./setup.sh)
# Requires sudo privileges.

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
USER="$(whoami)"

echo "==> Auris setup"
echo "    App dir:  $APP_DIR"
echo "    User:     $USER"
echo ""

# --- Install system packages ---
echo "==> Installing system packages (ffmpeg, icecast2)..."
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg icecast2 > /dev/null

# --- Symlink to /opt/auris ---
if [ ! -e /opt/auris ]; then
  echo "==> Creating symlink /opt/auris -> $APP_DIR"
  sudo ln -sf "$APP_DIR" /opt/auris
elif [ "$(readlink -f /opt/auris)" = "$APP_DIR" ]; then
  echo "==> /opt/auris already points here"
else
  echo "==> WARNING: /opt/auris exists but points elsewhere: $(readlink -f /opt/auris)"
  echo "    Skipping symlink. Remove it manually if you want to update."
fi

# --- Create recordings directory ---
RECORDINGS_DIR="${RECORDINGS_DIR:-/recordings}"
echo "==> Creating recordings directory ($RECORDINGS_DIR)..."
sudo mkdir -p "$RECORDINGS_DIR"
sudo chown "$USER":"$USER" "$RECORDINGS_DIR"

# --- Create SQLite data directory ---
echo "==> Creating data directory for SQLite DB..."
mkdir -p "$APP_DIR/data"

# --- Install /etc/default/auris config ---
if [ ! -f /etc/default/auris ]; then
  echo "==> Creating /etc/default/auris config..."
  sudo tee /etc/default/auris > /dev/null <<EOF
ALSA_DEVICE=plughw:1,0
CAPTURE_STREAM=false
CAPTURE_RECORD=false
RECORDINGS_DIR=$RECORDINGS_DIR
EOF
else
  echo "==> /etc/default/auris already exists, skipping"
fi

# --- Install Icecast config ---
echo "==> Installing Icecast2 config..."
sudo cp "$APP_DIR/system/icecast.xml" /etc/icecast2/icecast.xml
sudo systemctl restart icecast2 || sudo /etc/init.d/icecast2 restart

# --- Install systemd units ---
echo "==> Installing systemd unit..."
sudo cp "$APP_DIR/system/auris-capture.service" /etc/systemd/system/
sudo systemctl daemon-reload

# Stop and disable old services if present
sudo systemctl stop auris-stream auris-record 2>/dev/null || true
sudo systemctl disable auris-stream auris-record 2>/dev/null || true
sudo rm -f /etc/systemd/system/auris-stream.service /etc/systemd/system/auris-record.service
sudo systemctl daemon-reload

# --- Install sudoers ---
echo "==> Installing sudoers file for $USER..."
SUDOERS_TMP=$(mktemp)
sed "s/^trym /${USER} /" "$APP_DIR/system/auris-sudoers" > "$SUDOERS_TMP"
sudo cp "$SUDOERS_TMP" /etc/sudoers.d/auris
sudo chmod 440 /etc/sudoers.d/auris
rm -f "$SUDOERS_TMP"

if sudo visudo -c > /dev/null 2>&1; then
  echo "    Sudoers validated OK"
else
  echo "    ERROR: sudoers validation failed!"
  exit 1
fi

# --- Make capture script executable ---
chmod +x "$APP_DIR/capture.sh"

# --- Build Next.js ---
echo "==> Installing npm dependencies..."
npm install

echo "==> Building Next.js app..."
npm run build

echo ""
echo "==> Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Find your ALSA device:  arecord -l"
echo "  2. Select your device in the web UI (Audio Settings > Capture Device)"
echo "  3. Start with PM2:         pm2 start ecosystem.config.js && pm2 save"
echo "  4. (Optional) Nginx:       sudo cp system/nginx-auris.conf /etc/nginx/sites-available/auris"
echo "                             sudo ln -sf /etc/nginx/sites-available/auris /etc/nginx/sites-enabled/"
echo "                             sudo nginx -t && sudo systemctl reload nginx"
