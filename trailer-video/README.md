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

Thirteen more vertical clips, each its own format, look and sound, and between them they give away a little of what comes after
the end (the Fourth). The last four are cut from footage of their own: places and angles the game had never been filmed from
(the `wild-*`, `oner`, `lofi` and `tarot-*` shots in `../the-third-direction/tools/trailer/shots.mjs`, on camera paths of their
own):

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
| `short-wild` | WILDLIFE OF THE THIRD DIRECTION: a nature film of the Crater with a narrator (`src/data/lines-wild.json`) - night falling, the Moonwell, the blob ("small, soft, utterly defenceless") and its only friend the moth, each with a field guide's card; then on a long lens, X, the Hollow ("an apex predator"), the cage, his arm sweeping in, in slow motion. "Most creatures would run. The blob... does not." Remarkable. |
| `short-oner` | ONE TAKE: a slate and a clap, then 21 seconds without a cut - out of the ferns, round the Blob and its moth, over the floor, up to the Moonwell and round it, up, and into X's eyes - with the camera's timecode running the whole way. One crescendo under it. |
| `short-lofi` | lofi blob, beats to escape a crater to: the Blob by the Moonwell in the rain, her lullaby as a lofi beat, a now-playing card; for a moment the tape catches, the clock says 4:44 and something in the sky opens its eye. Did you see it? |
| `short-tarot` | YOUR OCTOBER FORTUNE: a tarot reading by candlelight, and no X in the deck. Shuffled, fanned, a card picked; seven turned, each boss in a gilded frame under its arcana - the Moon (Gloommother), the Emperor (Thornback King), Judgement (Toll Queen), Death (Bone Wyrm), the Magician (Mimic Queen), the Hermit (the Collector's eye in its jar), the Tower (the Mash, cracking) - each with its own voice and fortune; the last card, 0, the Fool, is the Blob. A dark waltz of the lullaby under it. |
| `short-lineup` | THE LINEUP (the itch.io launch): the game was *released* today, so its monsters are booked like suspects. Police tape and sirens; then a mugshot each against a height chart, a bar of crime jazz each - a camera flash, the letterboard placard with its charge ("impersonating a flower", "all of the above"), a pinned photo of the evidence with the fight playing in it, the profile. X is too tall for the chart: the camera looks up past 50 ft to his eyes ("Don't look up."). All eight in a row, RELEASED stamped, BAIL: $0 (it's free), a wanted poster for the blob (reward: your family back), and the logo: free on itch.io. The 3D bosses are their real models cut out on transparent backgrounds (`cutout3d` in `../the-third-direction/tools/gallery3d.ts`, saved by `tools/brand/sprites.mjs` there and copied into `public/lineup/`). |
| `short-popup` | THE POP-UP BOOK (itch.io): the game's idea - a flat world that finds a third direction - is what a pop-up book does. A storybook on a desk under a lamp, read by the Mother; its cover is the logo. Each page is printed with the game and its cut-outs fold up off the paper (CSS 3D: a standing page, a page lying flat, cut-outs hinged at their feet, leaves turned over the spine): the family; X's eyes in the dark, the parents pulled off the page; the five guardians one by one, each in its own voice; then the page tears open on the 3D world and X rises out from behind the book until the camera has to look up to his eyes; the Collector and the Mash stand up in 3D; the last page is the family together - "the rest of the story is yours" - and the book closes: free on itch.io. A storybook orchestra (harp, celesta, flute) on her lullaby. |
| `short-launch` | LAUNCH DAY (CrazyGames): the game launches on CrazyGames, so it launches. NOW ON CRAZYGAMES slams over a rocket on its pad in the pixel forest, searchlights sweeping. Mission control (on the radio, with its Quindar beeps): eight monitors come on, each a live feed of a fight, and the flight director polls the stations - go / no-go - and every boss answers GO in its own voice, X last (his monitor is static until his eyes open, and his GO is red). GO FOR LAUNCH; the countdown in three cuts (the pad, the blob looking up through the porthole, the engine bells); ignition, liftoff, and the rocket climbs out of the forest until the flat 2D sky comes down to meet it and breaks like glass: 3D space, the bosses tumbling past, X looming, a portal, white - out now on CrazyGames. A launch score: a clock under the poll that climbs a step with each GO, her lullaby in A major on the horns at liftoff. |
| `short-noir` | NOIR (CrazyGames): the game as a hardboiled comic book, read by its narrator (a lower, smokier voice). The cover - THE THIRD DIRECTION No. 1, "Night of the Missing Family": X black against the moon with three red eyes, the blob in a fedora under a streetlamp, rain - gets a NOW ON CRAZYGAMES sticker slapped on, and opens. A motion comic: page one panel by panel (the forest at midnight; "Name's Blob. Small. Round. Glows in the dark."; the family photo torn in two, MISSING; three red eyes); page two, the five guardians slammed down in slanted panels, each with its sound lettered (SHHHHH... KRAKK! DONNNG! SKREEEE! HA! HA! HA!) and its own voice. "So I did what nobody does. I looked up." - the camera tilts up off the page into the rain, the sky cracks, the paper tears, and behind it the world is in colour and has depth (the Collector and the Mash in panels turning in 3D); then the splash page, X inked with only his eyes red: FOUND YOU (in his own voice from the game). The back cover: out now on CrazyGames. The game's footage is inked by `make.sh` (posterised, edges drawn, only the reds kept). A slow blues in A minor (her lullaby on a tenor sax, brushes, upright bass, piano, vibraphone), a stalking riff for the guardians, the orchestra in colour. |

`src/shorts/` holds them (their kit, their end cards), `src/data/shorts.json` their cue sheets, `audio/shorts.py` the nine
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
| `audio/` | `lines.py` (Kokoro takes; a short's narrator has its own sheet, `src/data/lines-<short>.json`), `voices.py` (treatment, and `src/data/voice.json` for the captions, or `lines-<short>.voice.json`), `kit.py` (the orchestra and how to write for it), `orchestra.py` (the score), `promo.py` (the promos' scores), `shorts.py` (the shorts' orchestral scores), `mix.py` (mix and master to -14 LUFS). |
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
