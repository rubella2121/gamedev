# The Third Direction: the trailer (Remotion)

The game's trailer, made with [Remotion](https://www.remotion.dev): 1080×1920, 30 fps, about 67 s.

- **Picture:** real game footage, captured frame by frame from the game. Over it, in React: the camera moves, the grade, the
  flash, whip, glitch and dissolve cuts, the boom (the flat forest bursting into 3D blocks), the names, the Mother's words and
  the title.
- **Music:** an orchestral score in which the game's lullaby is the theme throughout. It is written note by note to the cue
  sheet and played by sampled instruments (FluidSynth + MuseScore General).
- **Sound design:** the game's own sound kit and monster voices, rendered from the game's code on the same cue sheet.
- **Voice:** the Mother tells it (Kokoro, `af_heart`), with no pitch shifting, in real-sounding rooms.

## The promos

Four short cuts (11 to 23 s, 1080×1920 like the trailer) for Reels, TikTok and Shorts, each with a hook in its first second,
words on screen for everyone scrolling with the sound off, its own score and sound design, and the same end card: play free on
RUN, vote in the October Jam. None of them shows the Fourth.

| | |
|---|---|
| `promo-2d-to-3d` | "This is a 2D game… until the stars go out, and you look up": the world bursts into 3D, X, the fight. |
| `promo-boss-rush` | "You're this big. / They're this big.": every guardian and boss with its name, a tally, and one "?" left. |
| `promo-family` | "They took my parents": home, the shadow, the journey, X falls, "I found you." |
| `promo-dont-look-up` | The creepy one, made to loop: the stars go out, they were never stars, his foot, "RUN." |

`src/promos.ts` is their cut and words (on the cue sheet `src/data/promos.json`), `src/Promo.tsx` the composition. Over the
trailer's transitions they add a zoom (into the lens and out of it), an iris (a ring of light opening from a point) and the
blocks (the game's cubes sweeping over the cut). The music is `audio/promo.py` on the trailer's orchestra (`audio/kit.py`),
the sound design `../the-third-direction/tools/trailer/promo-sfx.ts`; `audio/mix.py <...> <id>` mixes one and levels its
quiet moments so they carry on a phone. `scripts/make.sh promos promo-render` makes them (after the trailer's `voices`).

## Where things are

| | |
|---|---|
| `src/data/cues.json` | The cue sheet: when everything happens. The cut, the orchestra, the sound design and the voices all read it. |
| `src/data/lines.json` | The script: every spoken line, who says it, when, and in what space. |
| `src/edit.ts` | The cut: every shot, which clip, from which frame, how it is framed and how it comes in. |
| `src/Trailer.tsx` | The composition; `src/components/` holds the shot, the effects, the boom, the words and the title. |
| `audio/` | `lines.py` (Kokoro takes), `voices.py` (treatment, and `src/data/voice.json` for the captions), `kit.py` (the orchestra and how to write for it), `orchestra.py` (the score), `promo.py` (the promos' scores), `mix.py` (mix and master to -14 LUFS). |
| `scripts/clips.py` | Turns the captured footage into the clips in `public/clips/` (plus the boom still and the grain). |
| `scripts/make.sh` | All of it, in order. |

The footage is captured by `../the-third-direction/tools/trailer/capture.mjs` with the shots in `shots.mjs`. The sound
design is `../the-third-direction/tools/trailer/sfx.ts`.

## Making it

```sh
npm install
# the soundfont and its player
sudo apt install fluidsynth musescore-general-soundfont
# Python: kokoro-onnx soundfile scipy mido numpy pillow; Kokoro's model files:
#   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
#   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
FOOT=../foot KOKORO=../kokoro PY=python3 scripts/make.sh            # voices, music, clips, render
npm run dev                                                          # Remotion Studio, to look at it
```

To change the trailer, change `src/data/cues.json` (timing), `src/data/lines.json` (words) or `src/edit.ts` (shots), then run
`scripts/make.sh music render` (or `voices music render` when the words changed).
