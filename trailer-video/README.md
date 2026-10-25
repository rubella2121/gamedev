# The Third Direction: the trailer (Remotion)

The game's trailer, made with [Remotion](https://www.remotion.dev): 1080×1920, 30 fps, about 67 s.

- **Picture:** real game footage, captured frame by frame from the game. Over it, in React: the camera moves, the grade, the
  flash, whip, glitch and dissolve cuts, the boom (the flat forest bursting into 3D blocks), the names, the Mother's words and
  the title.
- **Music:** an orchestral score in which the game's lullaby is the theme throughout. It is written note by note to the cue
  sheet and played by sampled instruments (FluidSynth + MuseScore General).
- **Sound design:** the game's own sound kit and monster voices, rendered from the game's code on the same cue sheet.
- **Voice:** the Mother tells it (Kokoro, `af_heart`), with no pitch shifting, in real-sounding rooms.

## Where things are

| | |
|---|---|
| `src/data/cues.json` | The cue sheet: when everything happens. The cut, the orchestra, the sound design and the voices all read it. |
| `src/data/lines.json` | The script: every spoken line, who says it, when, and in what space. |
| `src/edit.ts` | The cut: every shot, which clip, from which frame, how it is framed and how it comes in. |
| `src/Trailer.tsx` | The composition; `src/components/` holds the shot, the effects, the boom, the words and the title. |
| `audio/` | `lines.py` (Kokoro takes), `voices.py` (treatment, and `src/data/voice.json` for the captions), `orchestra.py` (the score), `mix.py` (mix and master to -14 LUFS). |
| `scripts/clips.py` | Turns the captured footage into the clips in `public/clips/` (plus the boom still and the grain). |
| `scripts/make.sh` | All of it, in order. |

The footage is captured by `../the-third-direction/tools/trailer/capture.mjs` with the shots in `shots.mjs`. The sound
design is `../the-third-direction/tools/trailer/sfx.ts`.

## Making it

```sh
npm install
# the soundfont and its player
sudo apt install fluidsynth musescore-general-soundfont
# Python: kokoro-onnx soundfile scipy praat-parselmouth mido numpy pillow; Kokoro's model files:
#   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
#   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
FOOT=../foot KOKORO=../kokoro PY=python3 scripts/make.sh            # voices, music, clips, render
npm run dev                                                          # Remotion Studio, to look at it
```

To change the trailer, change `src/data/cues.json` (timing), `src/data/lines.json` (words) or `src/edit.ts` (shots), then run
`scripts/make.sh music render` (or `voices music render` when the words changed).
