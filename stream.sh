#!/usr/bin/env bash
set -euo pipefail

# Read config
if [ -f /etc/default/auris ]; then
  source /etc/default/auris
fi

ALSA_DEVICE="${ALSA_DEVICE_LISTEN:-${ALSA_DEVICE:-default}}"
BITRATE="${STREAM_BITRATE:-128k}"
ICECAST_PASSWORD="${ICECAST_SOURCE_PASSWORD:-sourcepass}"

COMPRESSOR_ENABLED="${COMPRESSOR_ENABLED:-0}"
AUDIO_FILTERS=""
if [ "$COMPRESSOR_ENABLED" = "1" ]; then
  AUDIO_FILTERS="-af acompressor=threshold=${COMPRESSOR_THRESHOLD:--20}dB:ratio=${COMPRESSOR_RATIO:-4}:makeup=${COMPRESSOR_MAKEUP:-6}dB:attack=${COMPRESSOR_ATTACK:-20}:release=${COMPRESSOR_RELEASE:-250}"
fi

exec /usr/bin/ffmpeg \
  -fflags +nobuffer \
  -use_wallclock_as_timestamps 1 \
  -f alsa -i "$ALSA_DEVICE" \
  $AUDIO_FILTERS \
  -acodec libmp3lame -ab "$BITRATE" -ar 44100 -ac 1 \
  -f mp3 -content_type audio/mpeg -flush_packets 1 \
  "icecast://source:${ICECAST_PASSWORD}@localhost:8000/mic"
