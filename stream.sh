#!/usr/bin/env bash
set -euo pipefail

# Read config
if [ -f /etc/default/auris ]; then
  source /etc/default/auris
fi

ALSA_DEVICE="${ALSA_DEVICE_LISTEN:-${ALSA_DEVICE:-plughw:CARD=PCH,DEV=0}}"
BITRATE="${STREAM_BITRATE:-128k}"

exec /usr/bin/ffmpeg \
  -fflags +nobuffer \
  -use_wallclock_as_timestamps 1 \
  -f alsa -i "$ALSA_DEVICE" \
  -acodec libmp3lame -ab "$BITRATE" -ar 44100 -ac 1 \
  -f mp3 -content_type audio/mpeg -flush_packets 1 \
  "icecast://source:sourcepass@localhost:8000/mic"
