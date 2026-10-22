# The Pressed World: the 3D part as one explorable map

**Status: concept.** The pictures are in [`concept-art/3d-world/`](../concept-art/3d-world/) and the tool that makes them is in `tools/world*`. Nothing in `src/` uses any of it,
and the 2D forest is untouched. The three bosses (X, the Hollow, The Collector, The Mash) are the game's own models, rendered here exactly as they are.

| picture | what it is |
| --- | --- |
| [`01-pressed-world-map.png`](../concept-art/3d-world/01-pressed-world-map.png) | the map: a cutaway of the whole wall, the route in five stops, what you find on the way |
| [`02-player-view.png`](../concept-art/3d-world/02-player-view.png) | eight moments on the game's 9:16 screen, with the game's own HUD drawn over them |
| [`03-route-and-rules.png`](../concept-art/3d-world/03-route-and-rules.png) | plan, profile, the numbers, seven rules, what it would take |
| `shots/*.jpg` | seven 1920 x 1080 pictures: landing, X, the Archive, the Remix, the long span, the summit, a hearth |
| `portrait/*.jpg`, `cast/*.jpg`, `map.jpg` | the pictures the sheets are made from |

## The idea

Today the 3D part is three fights in a row on one floating platform. Between them the game gives you a 5 second interlude in the same arena
(`Act2.bossDown` and `updateInterlude` in `src/act2/act2.ts`), and the wall behind the arena has two yellow smudges on it.

The Pressed World keeps every arena, every boss and every rule, and turns the quiet moment between the fights into a place:

* The inside of the drum is **one wall** of pinned specimens (the Specimen Wall the arena already has, made huge).
* The Garden sits at the bottom. **One island per boss climbs the wall**, each joined to the next by a stair-bridge that is **pinned shut** until the boss before it falls.
* **The parents hang near the top.** They are the goal and they are in sight from the start, so the map never asks the player to guess where to go.
* **Hearths** (pools of lantern light) are the safe places. **The Cinderfox** (see [`CINDERFOX.md`](./CINDERFOX.md)) shadows you on the long walks and will not enter a hearth.
* The 2D forest hangs far below, flat, like a pressed flower. The bridge you arrive by is the crack you fell through.

It rests on lines the game already says (`src/core/story.ts`, [`STORY.md`](./STORY.md)): "Far below, the forest hangs like a pressed flower." "Up on the wall, two yellow smudges. I know them."
"the wall is quiet. it should not be." "Someone has been keeping all of this." "They are all here. Stitched together." and, at the end, "Two small lights, close enough to touch."

## What stays and what is new

| kept as it is | new in the concept |
| --- | --- |
| the arena's layout: radius 18, four pillars near and four far, three wells, four surge pads, four light crystals, the landing seal (the positions in `arena.ts` and `features.ts`) | islands at different heights and stair-bridges between them |
| X, The Collector and The Mash: models, fights, lines, health, where they stand (beyond the north edge) | pinned gates that open when the boss before them falls |
| strike, lance, nova, dash, hearts, the light meter, the follow camera, the HUD | hearths: lantern light the hound will not enter |
| the story lines and the ending | the entry bridge and the crack; the parents as a place you walk up to |
| | optional: the Cinderfox as the clock on the long walks |

Every island is that arena with a different **dressing**, as the arena sheet already shows ("one map, three moods"). The look is the Pressed Garden of [`arena-map-sheet.png`](../concept-art/3d-reference/arena-map-sheet.png), itself a concept (visual design only: the floor you fight on stays flat). The Garden is cold teal and violet with X's red stage; the Archive is
walnut cabinets, jars with something pressed inside, amber lamps and giant pins; the Remix is cyan threads out to the wall, drifting petals, pink and teal light and a spine of bone for a bridge.
Orange is the fox, red is X, gold is the Blob.

## The layout

Units are the arena's (the Blob is 1.8 tall; the player walks 7.6 units a second, `PLAYER_SPEED` in `act2.ts`). `x` is right, `z` is toward the crack, `y` is up. The numbers live in `tools/world/world.ts`.

| place | centre (x, y, z) | radius | who is there |
| --- | --- | --- | --- |
| the Pressed Garden | 0, 0, 0 | 18 | X, the Hollow, at z = -29 |
| the Archive | 64, 46, -18 | 18 | The Collector |
| the Remix | -64, 92, -30 | 18 | The Mash |
| the Summit | 0, 136, -62 | 10 | a hearth |
| the Ledge | 0, 168, -118 | 7 | the parents, pinned on the wall behind it (Mother and Father, 32 units wide) |
| the wall | 0, 0, 0 | 132 | the inside of the drum, about 420 units tall, open at the top to the moon |

The route, leg by leg (walking only, the fights are not counted):

| leg | length | rise | slope | walk |
| --- | --- | --- | --- | --- |
| the crack to the Garden (entry bridge) | 74 | 0 | | 9.7 s |
| across the Garden (X) | 29 | 0 | | 3.8 s |
| Garden to Archive (stair 1, gate G1) | 55 | +46 | 57° | 7.3 s |
| across the Archive (The Collector) | 14 | 0 | | 1.8 s |
| the long span (bone bridge, gate G2, the chase) | 105 | +46 | 26° | 13.8 s |
| across the Remix (The Mash) | 18 | 0 | | 2.4 s |
| Remix to Summit (stair 2, gate G3) | 62 | +44 | 46° | 8.1 s |
| across the Summit (the last hearth) | 16 | 0 | | 2.1 s |
| the last stair | 51 | +32 | 39° | 6.7 s |
| the ledge | 7 | 0 | | 0.9 s |
| **the whole walk** | **430** | **+168** | | **57 s** |

That is short: the walk is about a minute and the three fights are about eight. If the walking should matter more, every distance is a number in `world.ts`; the first stair is also steeper than a
cube stair wants to be (57°) and would want landings. The plan and profile are drawn in `03-route-and-rules.png`.

## How it plays

1. **You arrive** on the entry bridge. The Garden has the arena's layout, with a hearth by the landing. A quiet lap first (wells, pads, crystals), then X on its stage.
2. **A boss falls, the next gate opens.** The gate is pinned shut by the Collector ("NOT FOR REMOVAL"); it opens when the boss before it is down. The hearts come back, as they do today.
3. **You walk to the next island**: a stair, a lantern at each end. On the stairs and the long span the Cinderfox may shadow you (it is optional; see below).
4. **The Archive, the Remix**: the same fight in a different room. Each has a hearth by the landing.
5. **The Summit, the last stair, the ledge.** The fox stops at the foot of the last stair. The parents are right above you and the game's ending plays as it does today.

**The Cinderfox** keeps the rules in [`CINDERFOX.md`](./CINDERFOX.md): it follows at 14 to 20 units, cannot be killed (only driven off), will not enter lantern light, one hit is one heart and then it backs off,
and its tails are the five forest guardians. In this world it hunts between the first gate and the foot of the last stair (the orange band in the profile). It is the only thing in the concept that is not the game's own.

**The camera** is the game's follow camera. On the long span it can swing round to show the hound on your heels (the "long span" pictures).
**Wells, pads and crystals** work exactly as they do today.

## What the pictures are

They are drawn in code, with the game's own models and painters, in a small in-engine renderer (not an image generator):

* The three bosses and the Cinderfox are imported through the model lab's builders (`labX`, `labCollector`, `labMash`, `labCinderfox`) and posed with its pose names (X `foot`, `arms`, `armor`; the Collector `minions`, `pins`, `drawer`; the Mash `toll`, `bloom`). Nothing about them is redrawn.
* The specimens on the wall are painted by the game's own 2D painters (`drawBlob`, `drawGloom`, `drawBellwether`, `drawSkitter`, `drawMoth`, `drawMimic`, `drawRootmaw`, `drawThornback`, `makeFlower`),
  Mother has her bow, and the pressed forest on the floor of the drum is the 2D game's own map drawn with its `Land` class.
* The islands are the arena's cube tiles; the colours are the arena's (`src/act2/arena.ts`).
* The Blob in these pictures is the gumdrop hero of [`blob-character-sheet.png`](../concept-art/3d-reference/blob-character-sheet.png), which is a concept too: the game's 3D Blob is still the voxel one.
* The player-view sheet uses the game's own stylesheet (`src/style.css`), so the hearts, meters, boss bar, captions and name card are the real ones. Lines marked *new line* are proposals.

| file | what |
| --- | --- |
| `tools/world3d.ts`, `tools/world3d.html` | the renderer page: `window.__world.render(spec)` |
| `tools/world/cast.ts` | imports the game's bosses and the Cinderfox, untouched |
| `tools/world/cubes.ts`, `props.ts`, `pieces.ts` | the cube kit (islands, pillars, bridges, drifting rocks) and the arena's furniture (wells, pads, crystals), plus hearths, pinned gates, giant pins |
| `tools/world/wall.ts`, `archive.ts`, `stitch.ts` | the Specimen Wall, the parents, the moon, the pressed forest; the Collector's wing; the Remix and the bone bridge |
| `tools/world/world.ts` | the layout above |
| `tools/world/shots.ts`, `tools/world-shots.py` | the shot builders and the shot list (cameras, lights, grade) |
| `tools/world/shade.ts`, `post.ts`, `tools/world-post.py` | materials with fog and rim light, bloom and grade, then god rays, depth of field and glow |
| `tools/world-render.mjs` | headless Chromium: renders a spec to PNGs |
| `concept-art/3d-world/*.html` | the sources of the three sheets |

Regenerate (needs `python3` with numpy and PIL for the post pass and for shrinking supersampled pictures):

```
npm run gallery                                          # builds dist-gallery/world3d.html
FINAL=1 python3 tools/world-shots.py specs.json landing x archive remix climb summit hearth
python3 tools/world-shots.py specs.json p-landing p-explore p-x p-archive p-remix p-chase p-hearth p-summit c-x c-collector c-mash c-fox map
node tools/world-render.mjs specs.json out/              # PNGs; save them as JPEG (quality 90) into concept-art/3d-world/
node concept-art/3d-reference/render.mjs ../3d-world/world-map.html ../3d-world/01-pressed-world-map.png 1800 2400
node concept-art/3d-reference/render.mjs ../3d-world/player-view.html ../3d-world/02-player-view.png 1800 1880
node concept-art/3d-reference/render.mjs ../3d-world/route-and-rules.html ../3d-world/03-route-and-rules.png 1800 2200
```

## What it would take

Rough guesses for one developer who knows the code; nothing here has been prototyped in the game.

| option | what changes | guess |
| --- | --- | --- |
| **A · pitch only** | nothing in `src/`. The sheets and pictures are the trailer, the store page and the pitch for what comes next | none |
| **B · walking beats** | keep the three fights untouched. Replace the 5 second interlude with a stair walk on the same cube tiles, a pinned gate and a hearth, no new enemies | 2 to 3 days |
| **C · B + the hound** | add steps 1 and 2 of the Cinderfox plan (it follows and glows; the charge and the toll) on the long walks | 3 to 4 more days |
| **D · the whole world** | every island standing at once, optional detours, secrets, all hearths, the hound with all five tails | after the jam |

Notes for B, from reading the director:

* The fights use **arena-local coordinates**: the platform is at the origin and the boss at `z = -29`. The walk can keep that. While the player walks the stair, the next island is put at an offset; when the player steps onto it,
  the world group is **rebased** (moved so that island is the origin, the player and the camera moved with it) and the fight starts as it does today, so the boss code never knows.
* `Act2.updateInterlude` already runs the player, the wells and the timed lines (`STORY.interlude`) for 5.2 seconds and then calls `startBoss()`. B makes that last until the player arrives at the new island instead.
* The stair, the gate and the hearth are small meshes built from the same cube batches as the pillars (`tools/world/cubes.ts` shows how); they can be added to `arena.world` and removed in `hide()`.
* The camera follows the player along the stair with the same rig (`updateRig`); a swing to look back is a change of `camYaw` for a few seconds.
* With the jam closing on 2 November, B is only worth starting if it can be playable by about 28 October (the same rule as for the Cinderfox). A is free and keeps every option open.

## Open questions for the owner

* **Is a walk between the fights wanted at all?** The fights are the game; the walk adds about a minute. The concept works as pitch art either way.
* **Which Blob?** These pictures use the concept gumdrop hero; the game's 3D player is the voxel Blob. Pick one before any of this is built.
* **The Cinderfox: in or out?** The world works without it. It is the one thing here that is not the game's own.
* **What happens at 0 hearts on a walk?** A proposal: back to the last hearth with the hearts full (on a boss island the arena's own restart rules apply).
* **Does the first stair need landings?** At 57° it is a ladder of cubes. Moving the Archive about 25 units further out in x makes it 40°.
