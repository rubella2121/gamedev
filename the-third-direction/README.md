# The Third Direction

A baby blob loses its family, crosses a forest of strange monsters, and discovers the third dimension.
Built for the RUN.world **October Jam** (theme: *Monster Mash*). The full design lives in [`GAME_SCRIPT.md`](./GAME_SCRIPT.md).

## Status: the whole game is playable
Home page (Play, Gentle / Normal / Nightmare, How to play, Quick showcase, sound, best time) -> opening -> the **open forest**
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
- **Double-tap**: a **dash** you cannot be hurt in.
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
`public/thumbnail.jpg` (512x512) is the required store thumbnail.

## How it is built
- One Three.js renderer: the 2D forest is 216x384, the 3D world is drawn at twice that, both scaled up with nearest-neighbour filtering.
  The forest (`src/forest/`) is painted pixel by pixel on a Canvas2D (`src/core/pix.ts`, `src/core/art.ts`, `src/forest/art3.ts`)
  and shown as a texture; at the boom those real pixels become cubes.
- The 3D arena (`src/act2/`) is a chunky platform with pillars, a pinned-specimen wall and an orbit camera. The bosses are not made of
  boxes: they are built from distance functions glued together and meshed once (`src/act2/kit/`), painted per vertex with 3D noise,
  lit with a toon ramp, and moved with tube chains (necks, tails, bony arms). They are built a few milliseconds at a time while you play
  the forest. How a boss is made and how it plugs into the fight: [`docs/3D-BOSSES.md`](./docs/3D-BOSSES.md).
  No art or audio files: sprites are drawn in code, sound is synthesised (`src/core/audio.ts`, `src/core/voice.ts`).
- Dev tools (they never ship): `npm run gallery` builds the model lab and the concept-art gallery (`tools/`), `npm run concepts`
  renders the boss cards into `concept-art/`, `npm run build:standalone` builds a test version with playing bots
  (`?debug` then `__bot.run('gloom'|'thicket'|'marsh'|'bones'|'meadow')` for the forest guardians and `__bot3.run(bossIndex)` for the
  3D bosses; `tools/e2e.mjs` drives the real game in headless Chromium).
- The RUN SDK is wired by the Vite plugin; `src/sdk.ts` wraps the few calls used so the game also runs outside the RUN app.
