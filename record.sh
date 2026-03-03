#!/usr/bin/env bash
set -euo pipefail

# Read config
if [ -f /etc/default/auris ]; then
  source /etc/default/auris
fi

ALSA_DEVICE="${ALSA_DEVICE_RECORD:-${ALSA_DEVICE:-plughw:0,0}}"
BITRATE="${RECORD_BITRATE:-128k}"
RECORDINGS_DIR="${RECORDINGS_DIR:-/recordings}"
mkdir -p "$RECORDINGS_DIR"

exec /usr/bin/ffmpeg \
  -f alsa -i "$ALSA_DEVICE" \
  -acodec libmp3lame -ab "$BITRATE" -ar 44100 -ac 1 \
  "$RECORDINGS_DIR/$(date +%Y-%m-%d_%H-%M-%S).mp3"
