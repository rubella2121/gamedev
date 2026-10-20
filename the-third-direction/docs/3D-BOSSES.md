# The 3D bosses: how they are made and how to add one

The last act of The Third Direction is a fight in a floating arena (radius 18) against three bosses in a row:
**X, the Hollow → The Collector → The Mash**. This page is the contract between the fight director and a boss, and a
guide to building a creature that looks like it belongs.

## Files

| file | what it is |
| --- | --- |
| `src/act2/act2.ts` | the fight director: boom intro, the player (move, strike, lance, nova, dash, hearts, light), the camera, the rests between bosses, the ending. **Do not edit it for a boss.** |
| `src/act2/fight.ts` | `Boss3D` (base class every boss extends), `Env` (what a boss can ask of the fight), `Weak`, `Danger`, `Solid`, `Lance3`, `Nova3` |
| `src/act2/arena.ts` | the world: platform, wall, pillars, player model, floor `marks`, debris `burst3`, lights |
| `src/act2/features.ts` | the arena's helpers for the player: healing wells, surge pads, light crystals |
| `src/act2/kit/*` | the creature kit: `sdf.ts` (shapes, smooth unions, surface-nets mesher, `Slicer`), `noise.ts` (3D noise, colours), `skin.ts` (toon material, glow, halo), `chain.ts` (`TubeChain`, `reach` (FABRIK), `follow`) |
| `src/act2/models/x.ts` | X's body. **The reference for how to build a creature.** |
| `src/act2/bosses/xboss.ts` | X's fight. **The reference for how to write a boss.** |
| `src/core/voice.ts`, `src/core/audio.ts` | procedural voices (`audio.v.xRoar()`, `audio.v.collectorSpeak(line)`, `audio.v.mashRoar()`, ...) and sound effects |
| `tools/lab3d.ts`, `tools/lab-render.mjs` | the model lab: renders a model from any camera, in any pose, to PNG |
| `src/dev/bots3d.ts` | a generic playing bot for 3D bosses (`__bot3`) |
| `tools/e2e.mjs` | runs the real game in headless Chromium so you can script it and take screenshots |

## The look (read `models/x.ts` first)

* Everything is drawn in code. No image, model or sound files. No external libraries beyond three.
* The game renders at 432x768 with no antialiasing: silhouette, colour contrast and glowing parts matter far more than
  fine detail. Judge a model from the game camera (`pos [0, 8.6, 24.7]`, `look [0, 1.2, 7.5]`, `fov 64`), not only close up.
* Body parts are signed distance functions (`ellipsoid`, `capsule`, `sphere`, `box`, `torus`), glued with `smin`
  (smooth union), carved with `ssub`, roughened with `fbm`/`worley`, meshed once with `meshGen`/`meshSDF` (surface nets,
  smooth normals, per-vertex ambient occlusion) and painted per vertex in the `color` callback (3D noise, veins, rot,
  inflamed rings, bone). That gives organic, textured, un-boxy shapes. Use `lazy()` around expensive parts.
* Thin or moving things (tails, necks, tentacles, bony arms, hair) are `TubeChain`s: move `pts`, call `update()`.
  `reach()` is inverse kinematics, `follow()` makes a chain trail behind its head (a whip).
* Materials: `skin({vertexColors:true, rim:0x5a3a90})` is the toon material with a rim of light (keeps dark monsters
  readable against the dark sky). `glow()` and `halo()` for eyes and light. Avoid white rims on thin things (they blow out).
* The scene lights are purple/cyan with a red point light (`arena.setRedLight(v)`); vertex colours are linear (use `rgb(0xRRGGBB)`).
* Budget per boss: at most ~70k triangles, ~120 draw calls (merge small meshes into `InstancedMesh`), and the whole
  build in at most ~3 s of 8 ms slices on this machine. Build through `meshGen` + the `Slicer` so the game never stalls:
  `Act2` pumps the slicer in the forest, a few ms per frame. Reuse geometry; keep per-frame updates cheap.
* Not boxy. If a part looks like a cube or a cylinder, give it a taper, a bend, a bulge or a seam.

## The fight (read `fight.ts` and `xboss.ts`)

A boss is a class extending `Boss3D` with a model it builds in `build(slicer)`:

* `pips`: hits per phase, e.g. `[2, 3, 3]`. Pass them as `base` to `super(...)` (scaled by difficulty, never below 2).
  `damage(1, x, y, z)` takes a hit and handles the health bar, flash, hit-stop, light, phase change and death for you.
  Aim for a fight of about 2.5 to 3 minutes for a skilled player (the bot, which plays well, is a lower bound).
* Lifecycle: `begin()` -> `onBegin()` + `updateIntro()` for `introLen` seconds (the player is held, the HUD is off) ->
  `startPhase()` -> `updateFight()` every frame -> a hit that empties a phase calls `onPhaseEnd()` then `startPhase()`;
  the last hit calls `onDie()` and runs `updateDying()` for `dyingLen` seconds, then the director takes over (`onVictory`).
  `restartPhase()` is called when the player dies (health is already restored to the start of the phase).
* `animate(dt)` runs every frame in every state (idle animation of the model).
* `weak()` returns what can be hurt **right now** (`Weak`: position, `reach` for the claw, `r` for light). The director
  does the rest: the strike's lunge toward it, the lance's aim assist and flight, the nova's reach, and calls
  `hitBy(kind, w)` (which calls `damage(1, ...)`; override `hitBy` to do more or to ask for more than one hit).
* `dangers()` returns what is about to hurt, for the bot: discs, rings, lanes, boxes, cones with `at` (seconds until live)
  and `dur`. Keep it honest: a bot that reads it should be able to win only by playing the real fight.
* Hurting the player: `env.hurt(fromX, fromZ)` (one heart, knockback, 1.5 s of invulnerability). Never check the player's
  invulnerability yourself. Put an honest telegraph (`arena.marks`, `arena.setShadow`, `arena.lanes`) before anything that
  hurts, at least `0.7 s * D.tele` long on the first use. `D` is the difficulty (`core/difficulty.ts`): scale warning
  times by `D.tele`, speeds by `D.speed`, how long a boss stays hittable by `D.window`.
* `env.solids`: columns (`{x, z, r, alive, onLight?}`) that block the player and stop light. Push your own (pins, shells)
  and remove them. `env.trap(true)` freezes the player in place (they can still strike, throw and burst light);
  `env.pull(vx, vz)` pushes the player this frame (wind, a maw); `env.addLight(n)` fills the light meter.
* Player powers a boss must make sense of: **strike** (tap; `onPlayerStrike(x, z, fx, fz)`, plus `weak()`), **lance**
  (hold 0.5 s, let go: a bolt, `onLance(l)` returns true if you stop it), **nova** (full meter, hold 1.3 s: a ring of light
  of radius 9.5 that grows over 0.5 s, `onNova(n)`; `n.R` is the current radius), **dash** (double-tap: 0.22 s, untouchable).
  Everything that is a "monster" in your fight (minions) should die to a strike, a lance or a nova, and give a little light.
* The arena also has healing wells, surge pads and light crystals (`features.ts`); do not rely on or fight them.
* Voice and words: `env.audio.v.<yourVoice>()` and a caption through `env.ui.caption(line, ms, true)`. Lines are
  short and strange, lower case, a monster talking to a child. `ui.bossTitle` is shown by the director.
* Positions: the platform is a disc of radius 18 around (0, 0); `+z` is toward the player's side (the camera starts at
  `z = 12`), the boss stands beyond the far edge at `z = BOSS_Z = -29`. Heights are `y`. `0` is the floor.
* Show/hide: `show()` makes the model visible, `hide()` removes everything the boss put in the world (including floor
  marks and meshes added to `arena.world`). The director calls `hide()` when you are gone and `begin()` to start.

## Testing

```
npm run build:standalone                        # the game with the test bots compiled in -> dist-standalone
npm run gallery                                 # the model lab -> dist-gallery
node tools/lab-render.mjs spec.json outDir      # PNGs of a model (see the header of the script for the spec format)
QS='?debug' node tools/e2e.mjs dist-standalone steps.json outDir   # play the game in headless Chromium
```

In a test (`?debug`): `__tt.debugFight(phase, bossIndex)` jumps into a boss's fight (0 = X, 1 = Collector, 2 = Mash; click the
`.btn.play` button first so the home page goes away); `__bot3.run(bossIndex, phase, speed)` plays it with the bot
(`speed` 3-4 runs fast, `__bot3.report()` says what happened). The test machine has no GPU, so rendering is slow: the bot
draws only every 6th frame. Read the screenshots you take; a fight that "works" but looks wrong is not done.
