# The Third Direction

A baby blob loses its family, crosses a forest of strange monsters, and discovers the third dimension.
Built for the RUN.world **October Jam** (theme: *Monster Mash*). The full design lives in [`GAME_SCRIPT.md`](./GAME_SCRIPT.md).

## Status: the whole game is playable
First visit: a **"tap to begin"** splash (with a **skip intro** button) and then a 48-second **cinematic intro** (a real-time trailer made of the game's own forest and
3D arena, with a score and sound effects made in code; **Skip** is always on screen, and the home page has a **▶ intro** chip to watch it again).
Home page (Play, Gentle / Normal / Nightmare cards with their hearts and best times, Trailer, Fight a boss, How to play, a sound switch) -> opening -> the **open forest**
(walk in any direction; a crossroads and five zones you can do in any order) -> in each zone you reach the **heart**, which
wakes a **guardian** in its own sealed clearing (Gloommother, Thornback King, Toll Queen, Bone Wyrm, Mimic Queen; each has its
own attacks, phases and weak point) -> the seal on the road opens -> the Edge -> the boom -> a big floating 3D arena with a
free camera and **three bosses in a row**: **X, the Hollow**, **The Collector** and **The Mash** (the guardians stitched back
together, with a scorpion tail) -> the ending with the rebuilt clearing, a share button and the fastest-clear leaderboard
(`rundot/leaderboard.config.json`).

The five zones (each has monsters you fight with light, a puzzle, a secret and a heart to reach):
Gloom Hollow, Rootmaw Thicket, Echo Marsh, Bone Wastes and Moth Meadow. See [`OPEN_FOREST_DESIGN.md`](./OPEN_FOREST_DESIGN.md).
Secrets give bonus hearts (up to +3) for the 3D fights. Every monster has a voice made in code ([`src/core/voice.ts`](./src/core/voice.ts)).
**Falling in a boss fight** (guardians and the three 3D bosses): on **Nightmare**, four falls in one fight start it over from the first phase
(a counter of four diamonds under the light meter shows how many you have used, and the third fall is a warning). On **Normal** and **Gentle**,
three falls in the same phase call the moth's **Second Wind** for that phase: one more heart and 20% longer windows to hurt the boss.
The rules are in [`src/core/falls.ts`](./src/core/falls.ts).

The **Mournmoth** (the friend you free in Moth Meadow) has a job: it takes the first hit of every fight (the **Moth Shield**: a bubble of
moonlight, then it dims and comes back after 18 / 25 / 40 seconds on Gentle / Normal / Nightmare), it leans toward a hidden warmth when you are
near one, it rests on your head when you stand still, trembles when you are one hit from a fall, dims when you are hit, and in the ending it
goes home to the moon (it is the moon's child). The logic is in [`src/core/mothbond.ts`](./src/core/mothbond.ts).
The story is told in captions in three voices: the blob's thoughts, Mother and Father, and the world itself. Every line, in order, is in [`docs/STORY.md`](./docs/STORY.md).

Not done yet: tuning from real playtests (difficulty, timings, audio mix), real-phone performance checks, and RUN host testing
(the game has only been run in a plain browser and a headless one, never inside the RUN app).

## Controls
One thumb on a joystick and one button. The button does more the longer you hold it:
- Move: WASD / arrow keys, or the touch joystick (drag anywhere on the left side).
- **Tap** (Space): a pulse of light in the forest, a claw strike in the 3D arena (it lunges at a weak point).
- **Hold, then let go**: a **Light Lance**, a bolt of light that flies far and hits weak points from a distance.
- **Hold longer with the three light orbs full**: a **Nova**, a burst of light all around you (it clears small monsters and shots, tears
  open weak points, and makes you untouchable for a moment). Hitting monsters fills the orbs.
- **Double-tap**: a **dash** you cannot be hurt in. It spends a charge (two on Normal, three on Gentle) and a charge comes back every couple of seconds, so mashing the button runs out fast. The charges sit next to the light meter.
- 3D arena: turn the camera with Q / E or by dragging on the right side (mouse: drag anywhere); R or the ◎ button recentres.
  The arena helps you: **wells** heal a heart and give light (they wilt, then grow back), **surge pads** throw you along the ring,
  **light crystals** burst into light when you hit them.

## Run it
```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production build into ./dist
```
`npm run build:artifact` makes one self-contained page (`dist-artifact/artifact.html`: RUN SDK stubbed, three.js and the game's CSS and
script inline) for pasting into a claude.ai Artifact. It is a playtest copy: no leaderboard, and saved settings last only for the tab.

Add `?debug` to the URL to expose `window.__tt` (the game object) for testing.

## Deploy to RUN.world
Needs the RUN CLI (`rundot`) and a signed-in RUN account — see https://events.run.world/events/cli-setup/agent.md

```bash
rundot login
rundot init --name "The Third Direction" --description "A baby blob, a forest of strange monsters, and the third dimension." --build-path ./dist --orientation Portrait
npm run build
rundot deploy          # private + unlisted by default; prints a share link
rundot game set-public # only when ready: submits the game for review
```
`public/thumbnail.jpg` (512x512) is the required store thumbnail. It is made from the game itself by `node tools/thumbnail.mjs` (the title, the family with
Mother's bow, a pair of eyes in the dark and the hero's name card; the header of that script says how to run it).

## How it is built
- One Three.js renderer: the 2D forest is 216x384, the 3D world is drawn at twice that, both scaled up with nearest-neighbour filtering.
  The forest (`src/forest/`) is painted pixel by pixel on a Canvas2D (`src/core/pix.ts`, `src/core/art.ts`, `src/forest/art3.ts`)
  and shown as a texture; at the boom those real pixels become cubes.
- The 3D arena (`src/act2/`) is a chunky platform with pillars, a pinned-specimen wall and an orbit camera. The bosses are not made of
  boxes: they are built from distance functions glued together and meshed once (`src/act2/kit/`), painted per vertex with 3D noise,
  lit with a toon ramp, and moved with tube chains (necks, tails, bony arms). They are built a few milliseconds at a time while you play
  the forest. How a boss is made and how it plugs into the fight: [`docs/3D-BOSSES.md`](./docs/3D-BOSSES.md).
  No art or audio files: sprites are drawn in code, sound is synthesised (`src/core/audio.ts`, `src/core/voice.ts`).
- The splash and the home page (`src/ui.ts`): the title is a pixel logo built from little cubes with a red depth that sways (`src/logo.ts`,
  drawn at the screen's own resolution so the cubes stay crisp), over a living background of fireflies and red eyes opening in the dark
  (`src/ambient.ts`, on the forest's own 216 x 384 grid). The how-to and the boss picker are sheets over the home page, and the end card
  uses the same pieces. The animation loop stops when the page is hidden.
- The cinematic intro (`src/cinematic/`): `cues.ts` is the shot list (one table of times that both the picture and the music read),
  `trailer.ts` directs the real game scenes (it borrows the forest and the 3D arena through the `trailer*` methods on them), and
  `score.ts` is the music: A minor like the in-game lullaby, planned note by note on the WebAudio clock (a second of the future at a
  time) from the same cue sheet, so a hit lands on its cut. It reuses the monster voices (`Voice.clock` places one at an exact time).
  The game's own sounds are muted while it plays, and the score stays silent if the player turned the sound off.
  Test builds (`?debug`) skip the first-visit splash; add `&intro` to see it.
  Getting past it: the splash has a **skip intro** button (and Escape), the trailer has a **Skip** button in its black top bar (and Escape, Enter or
  Space), and the intro plays by itself only once: leaving halfway does not bring it back (the home page has a Trailer button). The Skip button used
  to sit under the trailer's black bars (z-index) and could not be seen. The hero gets a name card in the trailer while the shadow creeps (`CUE.heroCard`).
- The Cinderfox (`src/act2/models/cinderfox*.ts`, [`docs/CINDERFOX.md`](./docs/CINDERFOX.md)) is a concept for the explorable map: a fire hound
  that stalks you with five tails, one trick per guardian. Its model and the pictures of its tricks live in the model lab; the game does not
  use them yet. Reference sheets are in `concept-art/3d-reference/`.
- Mother wears a small pink bow (`bow: true` in `drawBlob`, `drawBow` in `src/core/art.ts`: a hand-drawn 9 x 5 pixel sprite, 11 x 6 on the big
  pinned portrait). She is the left one of the family: in the opening, on the splash and the home page, and on the left of the two big
  blobs on the arena wall. Her pressed bow is beside her smudge after the slam.
- The hero is named the way every monster is, a name and a line under it: **The Blob, the last small light** (`STORY.hero` in `src/core/story.ts`; the first-time
  card, the trailer and the store thumbnail all read it).
- Telling a new player what to do: the first time anyone plays, a card (the hero's name card, then what is happening in three plain lines, `STORY.brief`;
  remembered with the `tt.briefed` key, test builds skip it unless you add `&intro`). It is shown only when the opening of a run that began with
  the Play button ends (`Forest.briefNext`), never in the trailer, the preview behind the home page or the boss showcase. While you are out on the roads a goal line under the five
  dots says "beat the five guardians · n of 5", then "the road is open · follow the red arrow". The move and pulse hints stay until you have
  moved or pulsed. Hints are only taken down by whoever put them up (`ui.hintIs`): a zone used to wipe every hint each frame.
- Dev tools (they never ship): `npm run gallery` builds the model lab, the voice lab, the score lab and the concept-art gallery (`tools/`);
  `node tools/thumbnail.mjs` makes `public/thumbnail.jpg` (after `npm run build:standalone` and `npm run gallery`);
  `node tools/score-render.mjs out/` renders the trailer score offline and writes `score.wav`, a spectrogram with the cue times and
  loudness per half second (it is how the score is balanced without listening). `npm run concepts`
  renders the boss cards into `concept-art/`, `npm run build:standalone` builds a test version with playing bots
  (`?debug` then `__bot.run('gloom'|'thicket'|'marsh'|'bones'|'meadow')` for the forest guardians and `__bot3.run(bossIndex)` for the
  3D bosses; `tools/e2e.mjs` drives the real game in headless Chromium).
- The RUN SDK is wired by the Vite plugin; `src/sdk.ts` wraps the few calls used so the game also runs outside the RUN app.
