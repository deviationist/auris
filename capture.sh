#!/usr/bin/env bash
set -euo pipefail

# Read config
if [ -f /etc/default/auris ]; then
  source /etc/default/auris
fi

ALSA_DEVICE="${ALSA_DEVICE:-plughw:0,0}"
CAPTURE_STREAM="${CAPTURE_STREAM:-0}"
CAPTURE_RECORD="${CAPTURE_RECORD:-0}"

if [ "$CAPTURE_STREAM" = "0" ] && [ "$CAPTURE_RECORD" = "0" ]; then
  echo "Nothing to capture (CAPTURE_STREAM=0, CAPTURE_RECORD=0)" >&2
  exit 0
fi

CODEC=(-acodec libmp3lame -ab 128k -ar 44100 -ac 1)
OUTPUTS=()

if [ "$CAPTURE_STREAM" = "1" ]; then
  OUTPUTS+=("${CODEC[@]}" -f mp3 -content_type audio/mpeg -flush_packets 1 "icecast://source:sourcepass@localhost:8000/mic")
fi

if [ "$CAPTURE_RECORD" = "1" ]; then
  RECORDINGS_DIR="${RECORDINGS_DIR:-/recordings}"
  mkdir -p "$RECORDINGS_DIR"
  OUTPUTS+=("${CODEC[@]}" "$RECORDINGS_DIR/$(date +%Y-%m-%d_%H-%M-%S).mp3")
fi

exec /usr/bin/ffmpeg \
  -fflags +nobuffer \
  -use_wallclock_as_timestamps 1 \
  -f alsa -i "$ALSA_DEVICE" \
  "${OUTPUTS[@]}"
