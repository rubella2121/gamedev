#!/usr/bin/env bash
# The whole trailer, from the captured footage to out/the-third-direction-trailer.mp4.
#
#   FOOT=<footage dir> KOKORO=<kokoro model dir> PY=<python with kokoro-onnx, soundfile, scipy, praat-parselmouth, mido> \
#     scripts/make.sh [voices] [music] [clips] [render]        (no steps: all of them)
#
# FOOT: the capture (the-third-direction/tools/trailer/capture.mjs). KOKORO: kokoro-v1.0.int8.onnx and voices-v1.0.bin.
# SF: a General MIDI soundfont (MuseScore General: apt install musescore-general-soundfont), played by fluidsynth.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${WORK:-/tmp/trailer-work}
PY=${PY:-python3}
SF=${SF:-/usr/share/sounds/sf3/MuseScore_General_Full.sf3}
STEPS=${*:-voices music clips render}
mkdir -p "$WORK" public/audio
has() { [[ " $STEPS " == *" $1 "* ]]; }

if has voices; then
  echo "== voices"
  $PY audio/lines.py "${KOKORO:?KOKORO: the Kokoro model folder}" "$WORK/takes"
  $PY audio/voices.py "$WORK/takes" "$WORK/voice"
fi
if has music; then
  echo "== orchestra"
  $PY audio/orchestra.py "$SF" "$WORK/orchestra.wav"
  echo "== sound design (the game's own sounds)"
  (cd ../the-third-direction && node tools/trailer/score-render.mjs ../trailer-video/src/data/cues.json "$WORK/sfx.wav" tools/trailer/sfx.ts __renderSfx)
  echo "== mix"
  $PY audio/mix.py "$WORK/orchestra.wav" "$WORK/sfx.wav" "$WORK/voice" public/audio/mix.wav
fi
if has clips; then
  echo "== clips"
  python3 scripts/clips.py "${FOOT:?FOOT: the captured footage}"
fi
if has render; then
  echo "== render"
  npx remotion render src/index.ts Trailer out/the-third-direction-trailer.mp4 --codec h264 --crf 18 --concurrency "${CONC:-4}"
fi
echo "== done"
