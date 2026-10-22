# Boss concept art

Pixel-art concept cards for every boss, drawn by the game's own painter (not AI images).

| File | Boss | Where | Packages |
|---|---|---|---|
| 00-overview.png | all of them on one sheet | | |
| 01-gloommother.png | Gloommother | Gloom Hollow guardian | A, B |
| 02-thornback-king.png | Thornback King | Rootmaw Thicket guardian | A, B |
| 03-toll-queen.png | Toll Queen | Echo Marsh guardian | A, B |
| 04-bone-wyrm.png | Bone Wyrm | Bone Wastes guardian | B |
| 05-mimic-queen.png | Mimic Queen | Moth Meadow guardian | B |
| 06-x-the-hollow.png | X, the Hollow | the 3D boss already in the game | |
| 07-the-moon.png | The Moon ("The Fourth Direction") | final boss | A, B, C |
| 08-the-mash.png | The Mash | alternate finale | |
| 09-the-collector.png | The Collector | alternate finale | |

Packages: **A** = Gloommother + Toll Queen + Thornback King + The Moon. **B** = all five guardians + The Moon.
**C** = The Moon only. The Mash and The Collector are alternatives to The Moon as the last fight.

## Regenerate

```
npm run concepts
```

That builds `tools/gallery.html` (`npm run gallery`) and renders the cards with headless Chromium
(`tools/render-concepts.mjs`; set `CHROMIUM_PATH` if Chromium is somewhere unusual).

The 2D guardians live in `src/forest/bossart.ts` (they are real sprites, ready to be dropped into the forest).
The 3D sketches (The Moon, The Mash, The Collector) are in `tools/gallery3d.ts` and are concept only: nothing in the game uses them yet.

## 3D references (not in the game yet)

Design references for a new 3D hero and a new 3D arena. Reference only: nothing in `src/` uses them.

| File | What |
|---|---|
| 3d-reference/blob-character-sheet.png | The Blob, 3D hero: turnaround, actions, faces, palette, scale and silhouette test |
| 3d-reference/arena-map-sheet.png | The Pressed Garden, 3D arena: plan, hero views, per-boss moods, profile, coordinates |
| 3d-reference/cinderfox-sheet.png | The Cinderfox, a fire hound that stalks you through the explorable map: turnaround, poses, the five tails, palette, scale |
| 3d-reference/cinderfox-abilities.png | The Cinderfox's five tricks (one per tail), the rules of the hunt, and how each maps onto the engine |

Regenerate with `node concept-art/3d-reference/render.mjs character.html blob-character-sheet.png 1800 1240` and
`node concept-art/3d-reference/render.mjs map.html arena-map-sheet.png 1800 2000` (the sources are the `.html` files next to them;
the map one uses three.js from `node_modules` for a throwaway mock-up).

The Cinderfox sheets are built from real renders of its model in the model lab (`src/act2/models/cinderfox*.ts`; the idea and its rules are in
[`docs/CINDERFOX.md`](../docs/CINDERFOX.md)). Regenerate: `npm run gallery`, then
`node tools/lab-render.mjs concept-art/3d-reference/cinderfox/plates.json out/plates` (save the PNGs as JPEG, quality 90, over the ones in
`3d-reference/cinderfox/`), then `node concept-art/3d-reference/render.mjs cinderfox.html cinderfox-sheet.png 1800 1240` and
`node concept-art/3d-reference/render.mjs cinderfox-abilities.html cinderfox-abilities.png 1800 1600`.

## The Pressed World (3D map concept, not in the game)

The 3D part as one explorable map: the Pressed Garden at the bottom of a drum whose wall is the Specimen Wall, one island per boss climbing it (X, The Collector, The Mash, exactly as they are),
pinned gates, hearths, the Cinderfox on the long walks, and the two yellow smudges (Mother and Father) near the top as the goal. Design and numbers: [`docs/3D-WORLD.md`](../docs/3D-WORLD.md). The 2D forest is untouched.

| File | What |
|---|---|
| 3d-world/01-pressed-world-map.png | the map: a cutaway of the whole wall, the route in five stops, what you find on the way |
| 3d-world/02-player-view.png | eight moments on the game's 9:16 screen, with the game's own HUD over them |
| 3d-world/03-route-and-rules.png | plan, profile, the numbers, seven rules, what it would take |
| 3d-world/shots/*.jpg | seven 1920 x 1080 pictures: landing, X, the Archive, the Remix, the long span, the summit, a hearth |
| 3d-world/portrait/*.jpg, cast/*.jpg, map.jpg | the pictures the sheets are made from (the bosses are the game's own models, untouched) |

They are drawn in code by the in-engine renderer `tools/world-render.mjs` (`npm run gallery` first; the shot list is `tools/world-shots.py`; the sheets are the `.html` files in `3d-world/`).
Regenerate a sheet with `node concept-art/3d-reference/render.mjs ../3d-world/world-map.html ../3d-world/01-pressed-world-map.png 1800 2400` (and `player-view.html` 1800 x 1880, `route-and-rules.html` 1800 x 2200).
