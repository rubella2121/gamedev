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
SHORTS="the-fourth fighter secrets phonk lullaby cartridge live villain festival wild oner lofi tarot lineup popup launch"
mkdir -p "$WORK" public/audio
has() { [[ " $STEPS " == *" $1 "* ]]; }

if has voices; then
  echo "== voices"
  $PY audio/lines.py "${KOKORO:?KOKORO: the Kokoro model folder}" "$WORK/takes"
  $PY audio/voices.py "$WORK/takes" "$WORK/voice"
  # the wildlife film's narrator: its own sheet of lines, placed against its own length
  $PY audio/lines.py "$KOKORO" "$WORK/takes-wild" src/data/lines-wild.json
  $PY audio/voices.py "$WORK/takes-wild" "$WORK/voice" src/data/lines-wild.json "$($PY -c "import json; print(json.load(open('src/data/shorts.json'))['shorts']['wild']['length'])")"
  # the pop-up book: the Mother reads it
  $PY audio/lines.py "$KOKORO" "$WORK/takes-popup" src/data/lines-popup.json
  $PY audio/voices.py "$WORK/takes-popup" "$WORK/voice" src/data/lines-popup.json "$($PY -c "import json; print(json.load(open('src/data/shorts.json'))['shorts']['popup']['length'])")"
  # launch day: mission control, on the radio
  $PY audio/lines.py "$KOKORO" "$WORK/takes-launch" src/data/lines-launch.json
  $PY audio/voices.py "$WORK/takes-launch" "$WORK/voice" src/data/lines-launch.json "$($PY -c "import json; print(json.load(open('src/data/shorts.json'))['shorts']['launch']['length'])")"
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
  # the lineup's suspects: the game's sprites and 3D cutouts (../the-third-direction: npm run gallery && node tools/brand/sprites.mjs)
  mkdir -p public/lineup
  for n in gloommother king queen wyrm mimic blob mother father collector-hd mash-hd x-hd; do
    cp "../the-third-direction/tools/brand/sprites/$n.png" public/lineup/
  done
  cp ../the-third-direction/brand/logo.png public/lineup/logo.png
  # the pop-up book: its printed pages (frames of the 2D and 3D game) and its cut-outs
  mkdir -p public/popup
  for n in blob mother father gloommother king queen wyrm mimic collector-hd mash-hd x-hd tree-a tree-b tree-c x-eyes; do
    cp "../the-third-direction/tools/brand/sprites/$n.png" public/popup/
  done
  cp ../the-third-direction/brand/logo.png public/popup/logo.png
  page() { ffmpeg -v error -y -ss "$2" -i "public/clips/$1.mp4" -frames:v 1 ${4:+-vf "$4"} -q:v 3 "public/popup/$3.jpg"; }
  page g-thicket 1.0 page1; page edge 2.0 page2; page g-gloom 0.5 page3; page edge-stars 1.0 page4
  page wild-moon 1.0 page5; page t-family 1.25 page6; page g-gloom 0.5 ground "crop=1080:420:0:700"
  # launch day: the same cut-outs, the forest floor, and the flat world's starry sky (the top of the edge, mirrored) to break
  mkdir -p public/launch
  for n in blob mother father gloommother king queen wyrm mimic collector-hd mash-hd x-hd tree-a tree-b tree-c moon x-eyes; do
    cp "../the-third-direction/tools/brand/sprites/$n.png" public/launch/
  done
  cp ../the-third-direction/brand/logo.png public/launch/logo.png
  cp public/popup/ground.jpg public/launch/ground.jpg
  ffmpeg -v error -y -ss 1.0 -i public/clips/edge-stars.mp4 -frames:v 1 \
    -filter_complex "[0]crop=1080:1000:0:0,lutrgb=r=val*1.35:g=val*1.35:b=val*1.35,split[a][b];[b]vflip,crop=1080:920:0:0[c];[a][c]vstack" \
    -q:v 3 public/launch/skypane.jpg
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
