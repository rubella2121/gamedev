# Stage 2: The Open Forest (design + progress)

Replaces the old straight-up corridor (`src/act1/`) with a free-roam forest in `src/forest/`.
Story beats, the Edge, the boom and the 3D fight stay the same (see `GAME_SCRIPT.md`).

## What changes for the player
- Move in every direction on a big scrolling map (1280 x 1760 px; the screen shows 216 x 384).
- Five zones around a crossroads, done in **any order**. Each zone = monsters + a puzzle + a heart to reach.
  Finishing a zone: X's shadow slams over its monsters and gains a feature (as in the script).
- **Light pulse** (the one action button, tap): a ring of light that hurts shadow monsters. "A shadow can't swallow light."
- **Hearts in 2D** (difficulty decides how many). Monsters hurt 1 heart, X's slam is lethal (3 on Gentle).
  Glowing flower patches heal. Dying respawns at the last checkpoint; solved puzzles and cleared zones stay solved.
- **Secrets**: one optional puzzle per zone; each gives +1 bonus heart in the 3D fight (cap +3).
- The seal on the road to the Edge opens when all five zones are done.

## Map (world px, x right, y down)
- Start glade (opening cutscene): (640, 1560)
- Crossroads hub: (640, 1130)
- Gloom Hollow W (250, 1060) · Rootmaw Thicket NW (250, 640) · Echo Marsh NE (1030, 640)
- Bone Wastes E (1050, 1060) · Moth Meadow SE (1030, 1480)
- Edge seal (640, 540) then road to the Edge plateau (640, 120), cliff at y ~ 60

## Zones
| Zone | Monsters | Puzzle | Secret | Heart |
|---|---|---|---|---|
| Gloom Hollow | Gloomlings (die to 1 pulse), nests that keep spawning in the dark | Three dark lamps: pulse lights each for 14 s; all three lit at once opens the inner glade | Hidden grove behind the nests | The Gloom Heart: a nest with 6 hp that spawns waves |
| Rootmaw Thicket | Rootmaws (snap when near, stunned by a pulse), Thornbacks (charge, stun themselves on trees, 2 pulses) | Two root walls: stand beside one until X's shadow forms, run, the slam smashes it | Push two stones onto two plates | The Rootheart |
| Echo Marsh | Bellwethers (cones; pulse cracks the bell and stuns them) | Reed gates that open and close on the bell rhythm, with patrols | Lily pads revealed by a pulse | The Bell Tower |
| Bone Wastes | Skitterbones (pounce marks; a pulse knocks one out of the air; 2 hits kill) | Bone barricade: stand so a pack's pounce path crosses it, they smash it | Bone cache behind a second barricade | The Bone Nest |
| Moth Meadow | Mimic Blooms (field 1 reacts to you, field 2 snaps in a wave) | Free the Mournmoth (hold), then wake five dormant flowers by standing still while the moth hovers | Flowers that only the moth shows | The Lightseed (no X feature; the shadow flinches) |

## Systems / files
- `src/forest/land.ts`: map shapes, walkable mask (8 px cells), biomes, props, ground drawing, colliders
- `src/forest/forest.ts`: the game class (opening, play loop, camera, hearts, pulse, slams, checkpoints, HUD, edge, crack)
- `src/forest/zones/*.ts`: one file per zone, all implement `Zone`
- `src/forest/art3.ts`: new sprites (Thornback, lamp, stone, plate, thorn gate, bone barricade, hearts of each zone)
- Game switches from `Act1` to `Forest`; `src/act1/` is deleted once the forest is at parity.
- Difficulty (`src/core/difficulty.ts`) feeds hearts, warning times, speed, vision.

## Test plan
- Bot per zone (scripted solutions; teleports are allowed to verify solvability, not difficulty).
- Full run bot: start -> five zones -> edge -> boom -> fight -> ending.
- Screenshots of every zone.

## Progress
- [x] land + camera + collision + opening on the new map
- [x] hearts, pulse, checkpoints, HUD, compass arrow, zone beacons
- [x] Gloom Hollow
- [x] Rootmaw Thicket
- [x] Echo Marsh
- [x] Bone Wastes
- [x] Moth Meadow
- [x] Edge seal + edge + crack + boom hand-off
- [x] secrets and bonus hearts in the 3D fight
- [x] bots (scripted zone tests, key-driven road navigation, a wandering soak test), README
- [ ] real playtests: how long a first run takes, how hard each zone is, whether the way is clear

## Final map numbers (world px)
- World 1280 x 1960. Start glade (640, 1720). Crossroads (640, 1290). Plateau (640, 432), cliff at y = 300.
- Gloom (250, 1230), Thicket (250, 860), Marsh (1030, 860), Bones (1050, 1230), Meadow (1030, 1640).
- Each zone has a neck closed by a gate/wall (lamp gate, two root walls, reed gate, bone barricade) that separates the heart from the entrance.
- The Edge seal is at (640, 700).
