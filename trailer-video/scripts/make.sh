#!/usr/bin/env bash
# The whole trailer, from the captured footage to out/the-third-direction-trailer.mp4; and the promos (promos: their scores,
# sound design and mixes; promo-render: out/the-third-direction-promo-<id>.mp4). The promos reuse the trailer's voice takes.
#
#   FOOT=<footage dir> KOKORO=<kokoro model dir> PY=<python with kokoro-onnx, soundfile, scipy, praat-parselmouth, mido> \
#     scripts/make.sh [voices] [music] [clips] [render] [promos] [promo-render]        (no steps: all of them)
#
# FOOT: the capture (the-third-direction/tools/trailer/capture.mjs). KOKORO: kokoro-v1.0.int8.onnx and voices-v1.0.bin.
# SF: a General MIDI soundfont (MuseScore General: apt install musescore-general-soundfont), played by fluidsynth.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${WORK:-/tmp/trailer-work}
PY=${PY:-python3}
SF=${SF:-/usr/share/sounds/sf3/MuseScore_General_Full.sf3}
STEPS=${*:-voices music clips render promos promo-render}
PROMOS="2d-to-3d boss-rush family dont-look-up"
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
if has promos; then
  echo "== promos: scores, sound design, mixes"
  $PY audio/promo.py "$SF" "$WORK/promos"
  for id in $PROMOS; do
    $PY -c "import json, sys; c = json.load(open('src/data/promos.json'))['clips'][sys.argv[1]]; json.dump({'id': sys.argv[1], 'length': c['length']}, open(sys.argv[2], 'w'))" "$id" "$WORK/promos/$id.json"
    (cd ../the-third-direction && node tools/trailer/score-render.mjs "$WORK/promos/$id.json" "$WORK/promos/promo-$id-sfx.wav" tools/trailer/promo-sfx.ts __renderPromoSfx)
    $PY audio/mix.py "$WORK/promos/promo-$id-orchestra.wav" "$WORK/promos/promo-$id-sfx.wav" "$WORK/voice" "public/audio/promo-$id.wav" "$id"
  done
fi
if has promo-render; then
  for id in $PROMOS; do
    echo "== render promo $id"
    npx remotion render src/index.ts "promo-$id" "out/the-third-direction-promo-$id.mp4" --codec h264 --crf 18 --concurrency "${CONC:-4}"
  done
fi
echo "== done"
