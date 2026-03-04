#!/usr/bin/env bash
set -euo pipefail

# Auris — uninstall script
# Removes systemd services, sudoers, config, symlink, PM2 process, and nginx config.
# Does NOT remove recordings, the app directory, or system packages (ffmpeg, icecast2).

echo "==> Auris uninstall"
echo ""

# --- Stop and remove PM2 process ---
if command -v pm2 &>/dev/null; then
  echo "==> Stopping PM2 process..."
  pm2 stop auris 2>/dev/null || true
  pm2 delete auris 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi

# --- Stop and remove systemd services ---
echo "==> Stopping and removing systemd services..."
for unit in auris-stream auris-record auris-capture; do
  sudo systemctl stop "$unit" 2>/dev/null || true
  sudo systemctl disable "$unit" 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/${unit}.service"
done
sudo systemctl daemon-reload

# --- Remove sudoers ---
echo "==> Removing sudoers file..."
sudo rm -f /etc/sudoers.d/auris

# --- Remove config ---
echo "==> Removing /etc/default/auris..."
sudo rm -f /etc/default/auris

# --- Remove symlink ---
if [ -L /opt/auris ]; then
  echo "==> Removing symlink /opt/auris..."
  sudo rm -f /opt/auris
fi

# --- Remove nginx config ---
if [ -f /etc/nginx/sites-enabled/auris ]; then
  echo "==> Removing nginx config..."
  sudo rm -f /etc/nginx/sites-enabled/auris
  sudo rm -f /etc/nginx/sites-available/auris
  sudo nginx -t 2>/dev/null && sudo systemctl reload nginx 2>/dev/null || true
fi

echo ""
echo "==> Uninstall complete!"
echo ""
echo "Not removed (manual cleanup if needed):"
echo "  - Recordings directory (default: /recordings)"
echo "  - App directory (this folder), including .env.local"
echo "  - System packages (ffmpeg, icecast2)"
echo "  - Icecast2 config (/etc/icecast2/icecast.xml)"
