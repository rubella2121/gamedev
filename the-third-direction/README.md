# The Third Direction

A baby blob loses its family, crosses a forest of strange monsters, and discovers the third dimension.
Built for the RUN.world **October Jam** (theme: *Monster Mash*). The full design lives in [`GAME_SCRIPT.md`](./GAME_SCRIPT.md).

## Status: the whole game is playable
Home page (Play, Gentle / Normal / Nightmare, How to play, Quick showcase, sound, best time) -> opening -> the **open forest**
(walk in any direction; a crossroads and five zones you can do in any order) -> the seal on the road opens -> the Edge -> the
boom -> a big 3D arena with a free camera and a four-phase boss fight -> the ending with the rebuilt clearing, a share button and
the fastest-clear leaderboard (`rundot/leaderboard.config.json`).

The five zones (each has monsters you fight with light, a puzzle, a secret and a heart to reach):
Gloom Hollow, Rootmaw Thicket, Echo Marsh, Bone Wastes and Moth Meadow. See [`OPEN_FOREST_DESIGN.md`](./OPEN_FOREST_DESIGN.md).
Secrets give bonus hearts (up to +3) for the 3D fight.

Not done yet: tuning from real playtests (difficulty, timings, audio mix), real-phone performance checks, and RUN host testing
(the game has only been run in a plain browser and a headless one, never inside the RUN app).

## Controls
- Move: WASD / arrow keys, or the touch joystick (drag anywhere on the left side).
- Action: Space, or the on-screen button. In the forest it is a **light pulse** (tap); it becomes "hold" to free the Mournmoth or look up.
- 3D arena: the button strikes. Turn the camera with Q / E or by dragging on the right side (mouse: drag anywhere); R or the ◎ button recentres.

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
- One Three.js renderer: the 2D forest is 216x384, the 3D world is drawn at twice that, both scaled up with nearest-neighbour filtering.
  The forest (`src/forest/`) is painted pixel by pixel on a Canvas2D (`src/core/pix.ts`, `src/core/art.ts`, `src/forest/art3.ts`)
  and shown as a texture; at the boom those real pixels become cubes.
- The 3D arena (`src/act2/`) is a chunky platform with a boss, pillars, a pinned-specimen wall and an orbit camera. No art or audio files: sprites are drawn in code, sound is synthesised (`src/core/audio.ts`).
- The RUN SDK is wired by the Vite plugin; `src/sdk.ts` wraps the few calls used so the game also runs outside the RUN app.
