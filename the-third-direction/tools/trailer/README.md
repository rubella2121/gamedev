# The trailer

Everything that makes `the-third-direction-trailer.mp4` (1080×1920, 30 fps, 1:18). The footage is the real game, captured
frame by frame. The music is the game's own intro score, re-timed and extended. The voices are text-to-speech.
Nothing here ships with the game.

What comes after the family is left out on purpose: the trailer keeps it a secret.

| File | What it does |
|---|---|
| `timeline.py` | The one sheet everything reads: the music's cues, the cuts, the words on screen, where each voice line lands, the transitions. |
| `shots.mjs` | Every shot: how the game is set up for it (debug hooks) and how many frames it runs. |
| `capture.mjs` | Plays each shot in headless Chromium on a fixed clock (`Game.manualClock` / `Game.tick`, 1/30 s, or 1/60 s for real slow motion) and saves the canvas as JPEGs. A shot can place its own 3D camera through `Game.beforeDraw`. |
| `score.ts` | The music: the intro score's instruments and monster voices (`src/cinematic/score.ts`), played to the trailer's cues, with new parts for X's fight, the rush, the last lock, the family and the ending. |
| `score-render.mjs` | Bundles `score.ts` (esbuild) and renders it on an OfflineAudioContext in headless Chromium. |
| `lines.py` | The script (Kokoro): the narrator is a blend of two male voices, slow, with held pauses; a couple of takes per line. |
| `voices.py` | Picks the take that fits each line's slot and gives it a space: EQ, compression, a convolution room. The narrator is taken down to a trailer voice's depth with Praat's PSOLA; the last line is turned into a true whisper. |
| `mix.py` | The voices on the music; the music ducks under speech. |
| `edit.py` | The picture: the cut, the grade, the transitions (flash / whip / glitch / dissolve), the motion graphics and the title, muxed with the mix at -14 LUFS. |

## Making it

```sh
# 1. footage (slow: the 3D shots take about 2 s a frame on a software renderer)
npm run build:standalone
node tools/trailer/capture.mjs dist-standalone tools/trailer/shots.mjs $OUT/foot          # or name some shots after it

# 2. music
python3 tools/trailer/timeline.py --cues > $OUT/cues.json
node tools/trailer/score-render.mjs $OUT/cues.json $OUT/score.wav

# 3. voices: Kokoro (pip install kokoro-onnx soundfile scipy praat-parselmouth) and its model files
#    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
#    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
(cd $TTS && python3 /path/to/tools/trailer/lines.py)                                     # run where the model files are
python3 tools/trailer/voices.py $TTS/lines $OUT/voice
python3 tools/trailer/mix.py $OUT/score.wav $OUT/voice $OUT/mix.wav

# 4. the picture (about 10 minutes on 4 cores); --scale 0.35 for a quick look, --still 66.6 for one frame
python3 tools/trailer/edit.py $OUT/foot $OUT/mix.wav $OUT/the-third-direction-trailer.mp4
```

Needs Python 3 with numpy and Pillow, ffmpeg, and the fonts Inter Display, JetBrains Mono and Caladea.
To change the edit, change `timeline.py` and run steps 2 to 4 again: the music follows the cues.
