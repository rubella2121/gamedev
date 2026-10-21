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
