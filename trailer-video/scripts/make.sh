#!/usr/bin/env bash
# The whole trailer, from the captured footage to out/the-third-direction-trailer.mp4; the promos (promos: their scores,
# sound design and mixes; promo-render: out/the-third-direction-promo-<id>.mp4); and the shorts (shorts, short-render: the same
# for out/the-third-direction-short-<id>.mp4). The promos and the shorts reuse the trailer's voice takes.
#
#   FOOT=<footage dir> KOKORO=<kokoro model dir> PY=<python with kokoro-onnx, soundfile, scipy, praat-parselmouth, mido> \
#     scripts/make.sh [voices] [music] [clips] [render] [promos] [promo-render] [shorts] [short-render]   (none: all of them)
#
# FOOT: the capture (the-third-direction/tools/trailer/capture.mjs). KOKORO: kokoro-v1.0.int8.onnx and voices-v1.0.bin.
# SF: a General MIDI soundfont (MuseScore General: apt install musescore-general-soundfont), played by fluidsynth.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${WORK:-/tmp/trailer-work}
PY=${PY:-python3}
SF=${SF:-/usr/share/sounds/sf3/MuseScore_General_Full.sf3}
STEPS=${*:-voices music clips render promos promo-render shorts short-render}
PROMOS="2d-to-3d boss-rush family dont-look-up"
SHORTS="the-fourth fighter secrets phonk lullaby cartridge live villain festival wild oner lofi"
mkdir -p "$WORK" public/audio
has() { [[ " $STEPS " == *" $1 "* ]]; }

if has voices; then
  echo "== voices"
  $PY audio/lines.py "${KOKORO:?KOKORO: the Kokoro model folder}" "$WORK/takes"
  $PY audio/voices.py "$WORK/takes" "$WORK/voice"
  # the wildlife film's narrator: its own sheet of lines, placed against its own length
  $PY audio/lines.py "$KOKORO" "$WORK/takes-wild" src/data/lines-wild.json
  $PY audio/voices.py "$WORK/takes-wild" "$WORK/voice" src/data/lines-wild.json "$($PY -c "import json; print(json.load(open('src/data/shorts.json'))['shorts']['wild']['length'])")"
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
if has shorts; then
  echo "== shorts: scores, synthesised music and sound design, mixes"
  $PY audio/shorts.py "$SF" "$WORK/shorts"
  for id in $SHORTS; do
    $PY -c "import json, sys; c = json.load(open('src/data/shorts.json'))['shorts'][sys.argv[1]]; json.dump({'id': sys.argv[1], 'length': c['length']}, open(sys.argv[2], 'w'))" "$id" "$WORK/shorts/$id.json"
    (cd ../the-third-direction && node tools/trailer/score-render.mjs "$WORK/shorts/$id.json" "$WORK/shorts/short-$id-sfx.wav" tools/trailer/shorts-sfx.ts __renderShortSfx)
    $PY audio/mix.py "$WORK/shorts/short-$id-orchestra.wav" "$WORK/shorts/short-$id-sfx.wav" "$WORK/voice" "public/audio/short-$id.wav" "$id"
  done
fi
if has short-render; then
  for id in $SHORTS; do
    echo "== render short $id"
    npx remotion render src/index.ts "short-$id" "out/the-third-direction-short-$id.mp4" --codec h264 --crf 18 --concurrency "${CONC:-4}"
  done
fi
echo "== done"
