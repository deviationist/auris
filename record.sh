#!/usr/bin/env bash
set -euo pipefail

# Read config
if [ -f /etc/default/auris ]; then
  source /etc/default/auris
fi

ALSA_DEVICE="${ALSA_DEVICE_RECORD:-${ALSA_DEVICE:-plughw:CARD=PCH,DEV=0}}"
BITRATE="${RECORD_BITRATE:-128k}"
RECORDINGS_DIR="${RECORDINGS_DIR:-/recordings}"
PART_SUFFIX=""
if [ -n "${RECORD_CHUNK_PART:-}" ] && [ "$RECORD_CHUNK_PART" -gt 0 ] 2>/dev/null; then
  PART_SUFFIX="-part-${RECORD_CHUNK_PART}"
fi
mkdir -p "$RECORDINGS_DIR"

exec /usr/bin/ffmpeg \
  -f alsa -i "$ALSA_DEVICE" \
  -acodec libmp3lame -ab "$BITRATE" -ar 44100 -ac 1 \
  "$RECORDINGS_DIR/$(date +%Y-%m-%d_%H-%M-%S)${PART_SUFFIX}.mp3"
