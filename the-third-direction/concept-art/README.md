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
