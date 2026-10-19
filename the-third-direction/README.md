# The Third Direction

A baby blob loses its family, crosses a forest of strange monsters, and discovers the third dimension.
Built for the RUN.world **October Jam** (theme: *Monster Mash*). The full design lives in [`GAME_SCRIPT.md`](./GAME_SCRIPT.md).

## Status: the whole script is playable
Opening → Gloomlings (+ the cube-glitch teaser) → Rootmaws puzzle → Bellwethers (Echo Marsh) → Skitterbones →
Mournmoth + Mimic Blooms → the edge → the boom → 3D arena → four-phase boss fight (Crusher, Many-Limbed, Watcher,
Hollow Core) → ending with the rebuilt clearing and the fastest-clear leaderboard (`rundot/leaderboard.config.json`).

Not done yet: tuning from real playtests (difficulty, timings, audio mix), real-phone performance checks, and RUN host testing
(the game has only been run in a plain browser and a headless one, never inside the RUN app).

## Controls
- Move: WASD / arrow keys, or the touch joystick (drag anywhere on the left side).
- Action: Space, or the on-screen button / right side of the screen. Hold to look up (2D), tap to strike (3D).

## Run it
```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production build into ./dist
```
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
- One Three.js renderer at 216x384, scaled up with nearest-neighbour filtering. Act 1 is painted pixel by pixel on a
  Canvas2D (`src/core/pix.ts`, `src/core/art.ts`) and shown as a texture; at the boom those real pixels become cubes.
- Act 2 is a chunky 3D arena (`src/act2/`). No art or audio files: sprites are drawn in code, sound is synthesised (`src/core/audio.ts`).
- The RUN SDK is wired by the Vite plugin; `src/sdk.ts` wraps the few calls used so the game also runs outside the RUN app.
