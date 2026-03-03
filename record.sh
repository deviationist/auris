#!/usr/bin/env bash
set -euo pipefail

# Read config
if [ -f /etc/default/auris ]; then
  source /etc/default/auris
fi

RECORDINGS_DIR="${RECORDINGS_DIR:-/recordings}"
mkdir -p "$RECORDINGS_DIR"

exec /usr/bin/ffmpeg \
  -i "http://localhost:8000/mic" \
  -c copy \
  "$RECORDINGS_DIR/$(date +%Y-%m-%d_%H-%M-%S).mp3"
