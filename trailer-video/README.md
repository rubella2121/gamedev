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

## The shorts

Nine more vertical clips, each its own format, look and sound, and between them they give away a little of what comes after
the end (the Fourth):

| | |
|---|---|
| `short-the-fourth` | IT'S NOT OVER: a happy ending, THE END - then nothing moves, the moon goes out, something unfolds where it was, its eye opens and it speaks (in its own voice from the game). Glimpses of where it takes them; "YOU FOUND THE THIRD DIRECTION. / SOMETHING FOUND YOU." |
| `short-fighter` | CHOOSE YOUR FIGHT: an arcade select screen, every boss alive in its card; a roulette onto X, VERSUS with stats, FIGHT!, K.O. (its speech chip), and a card that stays locked until after the end. A chiptune of the lullaby. |
| `short-secrets` | 5 THINGS YOU MISSED: counted down and marked up with a red pen - the stars are eyes, the Mash is every guardian, the moth is your shield, the soundtrack is one lullaby (on a staff, as the music box plays it); number one is classified. |
| `short-phonk` | BLOB MODE: a black-and-white phonk edit - the lullaby on an 808 cowbell, speed ramps, frames in negative on every blow, SMALL. ALONE. OUTNUMBERED. OUTSIZED. UNSTOPPABLE. - and the colour back for FOR THEM. |
| `short-lullaby` | THE LULLABY: her song with words, one to a note, karaoke-lit as the music box sings it; on "don't look up" it stops, and the moon blinks. |
| `short-cartridge` | THE CARTRIDGE: a handheld on a desk in the dark; the cartridge goes in, it boots, and the little 2D game plays on its little screen to its own chip tune. The stars are eyes, the glass cracks three times, and the game breaks out of its screen into 3D - IT'S NOT. At the end it is back in its console: YOUR TURN. |
| `short-live` | LIVE: WORLD RECORD ATTEMPT: a speedrun stream - timer, splits, the runner's camera, chat, alerts. Five 2D guardians in a blur; the stream's picture cracks and the game goes 3D and fills the frame; three bosses; a new world record. Then a split nobody put there, the timer turns red, ??? joins the chat, and the stream goes offline (last seen: looking up). Next runner: you. |
| `short-villain` | VILLAIN EDIT: X in red and black to a Brazilian phonk (his riff in A Phrygian on the cowbell): HE TOOK THEM. HE'S THE FINAL BOSS. NOTHING IS ABOVE HIM. His boss bar, tagged FINAL BOSS. A record scratch; above him something unfolds, in violet, its own bar slides in above his, four deep, and takes the tag. EVEN VILLAINS HAVE VILLAINS. |
| `short-festival` | THE FESTIVAL TRAILER: cut like an art-house film's - letterboxed, graded, grained, the gate weaving, a projector running. White words on black between slow shots (every night she sang him the same song, and gave him one rule), her lullaby on a piano; silence; "Don't look up."; everything at once; laurels and reviews (the moth's, X's, and one from something else); the title. |

`src/shorts/` holds them (their kit, their end cards), `src/data/shorts.json` their cue sheets, `audio/shorts.py` the six
orchestral scores, `../the-third-direction/tools/trailer/shorts-sfx.ts` the rest of their sound (and all the music of the
three synthesised ones). A short's `mix` can set its balance and how far its quiet moments are brought up (`ride`; the festival
trailer keeps its silence). `scripts/make.sh shorts short-render` makes them.

## Where things are

| | |
|---|---|
| `src/data/cues.json` | The cue sheet: when everything happens. The cut, the orchestra, the sound design and the voices all read it. |
| `src/data/lines.json` | The script: every spoken line, who says it, when, and in what space. |
| `src/edit.ts` | The cut: every shot, which clip, from which frame, how it is framed and how it comes in. |
| `src/Trailer.tsx` | The composition; `src/components/` holds the shot, the effects, the boom, the words and the title. |
| `audio/` | `lines.py` (Kokoro takes), `voices.py` (treatment, and `src/data/voice.json` for the captions), `kit.py` (the orchestra and how to write for it), `orchestra.py` (the score), `promo.py` (the promos' scores), `shorts.py` (the shorts' orchestral scores), `mix.py` (mix and master to -14 LUFS). |
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
