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

# --- Set up authentication credentials ---
if grep -q '^AUTH_USERNAME=' /etc/default/auris 2>/dev/null && grep -q '^AUTH_PASSWORD_HASH=' /etc/default/auris 2>/dev/null; then
  echo "==> Auth credentials already configured, skipping"
else
  echo "==> Setting up authentication (leave password empty to skip)..."
  read -rp "    Auth username [admin]: " AUTH_USER
  AUTH_USER="${AUTH_USER:-admin}"

  read -rsp "    Auth password (empty = no auth): " AUTH_PASS
  echo ""

  if [ -z "$AUTH_PASS" ]; then
    echo "    Skipping auth — app will run without login"
  else
    while true; do
      read -rsp "    Confirm password: " AUTH_PASS_CONFIRM
      echo ""
      if [ "$AUTH_PASS" != "$AUTH_PASS_CONFIRM" ]; then
        echo "    Passwords do not match. Try again."
        read -rsp "    Auth password: " AUTH_PASS
        echo ""
        continue
      fi
      break
    done

    AUTH_HASH=$(AUTH_PASS="$AUTH_PASS" node -e "require('bcryptjs').hash(process.env.AUTH_PASS, 10).then(h => process.stdout.write(h))")
    # Remove any existing partial auth config
    sudo sed -i '/^AUTH_USERNAME=/d; /^AUTH_PASSWORD_HASH=/d' /etc/default/auris
    echo "AUTH_USERNAME=$AUTH_USER" | sudo tee -a /etc/default/auris > /dev/null
    echo "AUTH_PASSWORD_HASH='$AUTH_HASH'" | sudo tee -a /etc/default/auris > /dev/null
    echo "    Auth credentials saved to /etc/default/auris"
  fi
fi

# --- Set up .env.local ---
if [ -f "$APP_DIR/.env.local" ] && grep -q '^AUTH_SECRET=' "$APP_DIR/.env.local" 2>/dev/null; then
  echo "==> AUTH_SECRET already set in .env.local, skipping"
else
  echo "==> Generating AUTH_SECRET in .env.local..."
  AUTH_SECRET=$(openssl rand -base64 32)
  if [ -f "$APP_DIR/.env.local" ]; then
    # Remove existing AUTH_SECRET/AUTH_TRUST_HOST if present
    sed -i '/^AUTH_SECRET=/d; /^AUTH_TRUST_HOST=/d' "$APP_DIR/.env.local"
  fi
  echo "AUTH_SECRET=$AUTH_SECRET" >> "$APP_DIR/.env.local"
  echo "AUTH_TRUST_HOST=true" >> "$APP_DIR/.env.local"
  echo "    AUTH_SECRET generated"
fi

# --- Install Icecast config ---
echo "==> Installing Icecast2 config..."
sudo cp "$APP_DIR/system/icecast.xml" /etc/icecast2/icecast.xml
sudo systemctl restart icecast2 || sudo /etc/init.d/icecast2 restart

# --- Stop and remove old auris-capture service ---
echo "==> Removing old auris-capture service (if present)..."
sudo systemctl stop auris-capture 2>/dev/null || true
sudo systemctl disable auris-capture 2>/dev/null || true
sudo rm -f /etc/systemd/system/auris-capture.service

# --- Install systemd units ---
echo "==> Installing systemd units..."
sudo cp "$APP_DIR/system/auris-stream.service" /etc/systemd/system/
sudo cp "$APP_DIR/system/auris-record.service" /etc/systemd/system/
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

# --- Make capture scripts executable ---
chmod +x "$APP_DIR/stream.sh" "$APP_DIR/record.sh"

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
