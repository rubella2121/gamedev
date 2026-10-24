# The trailer

Everything that makes `the-third-direction-trailer.mp4` (1080×1920, 30 fps, about 1:46): the footage is the real game,
captured frame by frame; the voices are text-to-speech; the music is synthesised. Nothing here ships with the game.

| File | What it does |
|---|---|
| `timeline.py` | The one sheet everything reads: the cuts, the words on screen, where each voice line lands, the transitions. |
| `shots.mjs` | Every shot: how the game is set up for it (debug hooks) and how many frames it runs. |
| `capture.mjs` | Plays each shot in headless Chromium on a fixed 1/30 s clock (`Game.manualClock` / `Game.tick`) and saves the canvas as JPEGs. |
| `lines.py` | The voice lines and who says them (Kokoro). |
| `voices.py` | Gives each character a sound (ffmpeg): the narrator close, the parents far, the Blob small, the Fourth huge and doubled. |
| `music.py` | The score, in numpy: the lullaby, the drums, the hits on the cuts. |
| `mix.py` | The voices on the music; the music ducks under speech. |
| `edit.py` | The picture: the cut, the grade, the transitions (flash, whip, glitch, dissolve), the motion graphics and the title, muxed with the mix. |

## Making it

```sh
# 1. footage (slow: the 3D shots take about 2 s a frame on a software renderer)
npm run build:standalone
node tools/trailer/capture.mjs dist-standalone tools/trailer/shots.mjs $OUT/foot          # or name some shots after it

# 2. voices: Kokoro (pip install kokoro-onnx soundfile) and its model files
#    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
#    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
(cd $TTS && mkdir -p lines && python3 /path/to/tools/trailer/lines.py)                   # run where the model files are
python3 tools/trailer/voices.py $TTS/lines $OUT/voice

# 3. music and mix
python3 tools/trailer/music.py $OUT/music.wav
python3 tools/trailer/mix.py $OUT/music.wav $OUT/voice $OUT/mix.wav

# 4. the picture (about 10 minutes on 4 cores); --scale 0.35 --from 40 --to 60 for a quick look, --still 97.9 for one frame
python3 tools/trailer/edit.py $OUT/foot $OUT/mix.wav $OUT/the-third-direction-trailer.mp4
```

Needs Python 3 with numpy and Pillow, ffmpeg built with rubberband, and the fonts Inter Display, JetBrains Mono and Caladea.
To change the edit, change `timeline.py` and run steps 3 and 4 again: the music hits the transitions listed there.
