# The Cinderfox: the hound that follows you

**Status: concept.** The model, its five poses and the pictures of its tricks exist in the model lab. Nothing in the game uses them yet.
Reference sheets: [`concept-art/3d-reference/cinderfox-sheet.png`](../concept-art/3d-reference/cinderfox-sheet.png) (what it looks like) and
[`concept-art/3d-reference/cinderfox-abilities.png`](../concept-art/3d-reference/cinderfox-abilities.png) (what it does).

## The idea

A hound of black stone and ash, lit from inside, that shadows the Blob through the explorable 3D map while it looks for its parent.
It cannot be killed, only driven off. It carries **five tails of flame, one in the colour of each forest guardian**, and the tail that
blazes is the trick it is about to use. So every encounter is a small lesson: the tell is the colour, the answer is something the player
already knows from the guardian fights, and no two encounters in a row are the same.

Why it earns its place:

* The exploring parts of a map are quiet. A hunter you cannot shoot is the cheapest way to keep them tense, and it gives the player a
  reason to move (it is a clock: the map is how long you stay ahead of it).
* One creature, five behaviours. Each trick is a hazard the engine already draws (ring, lane, cone, pull), so it is cheap next to a new boss.
* It is a Monster Mash in one body (the jam's theme): five monsters' tricks on one hound. The tails are the forest remembering.
* It reads from far away. Orange glow in the fog is the only warm light that is not the Blob or a lantern, so the player always knows
  where it is without a marker. Orange is the fox's colour, red is X's, gold is the Blob's: keep it that way.

## What it looks like

Units are the arena's (the Blob is 1.8 tall). The fox is about 3.5 at the back (twice the Blob), 4.4 at the ears and 6.3 with its tails up. Paws on `y = 0`, it faces `+z`.

* a lean hound, ribs showing, long digitigrade legs, three claws on each paw
* a **skull mask**: the snout and jaw are bleached bone, dark round the eyes; the eyes are white-hot slits
* ears like candle flames; cheek ruffs swept back, tipped with fire
* burnt stone body (`CHAR`, `ASH`), cracks and the gaps between the ribs glow `EMBER` to `HOT`; joints glow a little at the knee and ankle
* five tails, left to right as you look at its face: **toll** (lavender), **gloom** (cyan), **thorn** (amber), **mimic** (pink),
  **bone** (ivory). Each is three layers of additive flame plus little tongues; the blazing one is taller and brighter, the rest dim
* a warm point light under the belly and a small one in front of the face, drifting sparks, a pool of light on the ground

Built the way X is built (see `docs/3D-BOSSES.md`): distance functions melted together and meshed once, painted per vertex, a second
additive layer for what glows, `TubeChain`s for the legs (two-bone IK), the neck and the tails.

Cost today (lab): about **95k triangles** (the budget is 70k: the body and head are drawn twice for the glow, so coarser cells, `0.055`
for the body and `0.037` for the head, bring it to about 70k), 66 meshes, built in 1.8 s of 8 ms slices.

## The Hunt: the rules that make it fair

1. **Always there.** It shadows you from 14 to 20 units away, circling at the edge of your light rather than straight behind you.
   You see its glow in the fog and hear it crackle.
2. **Heat is distance.** The ribs brighten and embers stream the closer it gets.
3. **A deck, not dice.** About every 20 s it draws a tail. All five are used before any repeats, and never the same one twice in a row.
4. **The tell is a promise.** At least 0.9 s from the tail blazing to anything that can hurt (scale with `D.tele`, as the bosses do).
5. **Cannot be killed, only driven off.** Each trick has a perfect answer (below). Doing it sends the fox away for about 40 s.
6. **Hearths.** Pools of lantern light it will not enter. Rest there, look at the map, plan the next run.
7. **One hit is one heart, then it backs off for 6 s.** No chains.
8. **The end.** It stops at the door of the parent's room. The boss fight is yours alone. (Open question: see the end of this page.)

## The five tails, five tricks

All numbers are first guesses to tune. `u` is an arena unit. The Blob's powers are strike (tap), lance (hold), nova (full meter) and dash
(double-tap, 0.22 s untouchable).

| | trick | tell (the tail blazes, plus) | what it does | the answer | drive it off | engine |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Toll of Flame** (lavender, the Toll Queen) | rears up, head back, a bell tolls once, 1.2 s | three rings of fire, a bell stroke apart; each ring has a 62° gap and each gap is 36° further round | step through the gaps one after another; a pillar breaks a ring | pass all three untouched: it chokes on its own smoke and backs away | `ring` Dangers expanding. **New:** a ring with a gap |
| 2 | **Smoke Veil** (cyan, the Gloommother) | head low, breathes in, ribs flare then go dark | a black cloud 14 u wide for 6 s: you see a few steps, its eyes and tails still glow; halfway it pounces out of it | leave the cloud, or stand in lantern light; a blink of the eyes is the pounce | sidestep the pounce: it flies through and the smoke vents | fog and camera, one `lane` Danger for the pounce |
| 3 | **Cinder Charge** (amber, the Thornback King) | digs in, body low; a lane of light draws itself towards you, 0.9 s | runs the lane at three times your speed, leaves a trail of fire that burns for 4 s | step out of the lane when the ribs flare; mind which side of the fire you are on | make it hit a wall or pillar: stunned 3 s, then it trots away | one `lane` Danger for the run, `disc` Dangers for the fire |
| 4 | **Will-o'-the-Wisp** (pink, the Mimic Queen) | the tail rises and beckons; three wisps lift off on threads and hum the parent's lullaby | the wisps drift ahead towards the fire and a faint pull tugs you after them; touch one and it bursts | do not follow the song (the parent glows gold, never pink); pop the wisps from afar | pop all three before they reach you: it sulks 5 s and drops a coal of light | three `Weak` targets, `env.pull()`, a `disc` Danger for the burst |
| 5 | **Ash Sweep** (ivory, the Bone Wyrm) | turns side-on, drops a shoulder, winds the tail back, 0.7 s, dry crackle | the tail sweeps a 150° fan 8 u deep in 0.4 s: damage and knockback; bone needles fly off the far edge; ash slows you | stay out of the fan or dash through it; sidestep the slow needles | dash through at the last instant: the tail snaps and it limps (slower) for 15 s | a `cone` Danger, `lane` Dangers for the needles |

The tells use the guardians' own colours and sounds, so a player who beat the forest already half-knows them.

## How it fits the map

* The fox lives in the explorable map, not in the boss arena. It is not a `Boss3D`: it is a stalker system the map runs (follow, pick a
  tail, run the trick), and its tricks are drawn with the same `Danger` shapes (`src/act2/fight.ts`) so hits go through `env.hurt()`.
* It does not replace The Mash, which stitches the guardians together as a boss. The fox is the same idea as a hunter: the tails foreshadow
  the colours the player meets again in the finale.
* Hearths and the parent's door are map pieces: they need to exist before the fox can be tuned.

## Build it in steps

Each step leaves the game playable, so it can stop wherever the deadline says.

1. **It follows and glows.** The model in the map, a follow behaviour with a gait (the model already takes `stride`, `crouch` and the
   other pose values), its light, a crackle that gets louder, a hit on touch. This is what makes the map feel hunted.
2. **Charge and toll.** The two that read best and use only existing Dangers (plus the ring with a gap).
3. **Veil and sweep.**
4. **Wisp, hearths, drive-off.** The part that turns a threat into a game.

Rough guess for one developer who knows the code: 1 to 2 days per step. With 11 days left and a map to redesign, steps 1 and 2 are the
honest scope, and step 3 only if the map is playable by about 28 October.

Before it goes into the game: trim the triangles (see above), give it a walk and a run cycle (drive the pose values from speed), and
make the effects instanced and pooled (the lab versions rebuild a ring geometry per call and allocate sprites freely).

## What exists now

| file | what |
| --- | --- |
| `src/act2/models/cinderfox.ts` | the model: `CinderfoxModel` (`build`, `apply(pose)`, `update`), `TAILS`, `FoxPose`, `POSES` (stand, coil, leap, toll, veil, lure, sweep, stalk) |
| `src/act2/models/cinderfoxFx.ts` | the five tricks as pictures: `FoxFx.show(kind, phase)`, `FX_KINDS`, a gold stand-in for the player |
| `src/act2/models/cinderfoxLab.ts` | the lab hooks: `__lab.pose('preset', n)`, `('fx', 1..5)`, `('fxphase', 0..1)`, `('yaw', rad)`, `('dash', u)`, `('glow', 0)` |
| `tools/lab3d.ts`, `tools/lab-render.mjs` | the `fire` lighting (a night lit by the creature, no floor), chosen per shot with `"env": "fire"` |
| `concept-art/3d-reference/cinderfox*.html` | the sources of the two sheets; the PNGs next to them are the output |
| `concept-art/3d-reference/cinderfox/` | the lab renders the sheets are built from (`plates.json` is the spec that makes them) |

Regenerate the pictures:

```
npm run gallery
node tools/lab-render.mjs concept-art/3d-reference/cinderfox/plates.json out/plates     # PNGs; save them as JPEG (quality 90) over the ones in cinderfox/
node concept-art/3d-reference/render.mjs cinderfox.html cinderfox-sheet.png 1800 1240
node concept-art/3d-reference/render.mjs cinderfox-abilities.html cinderfox-abilities.png 1800 1600
```

## Open questions for the owner

* **How does it end?** Recommended: it herds you and stops at the parent's door, and the boss fight is yours alone. The alternatives are a
  last chase that you win by using all five answers in a row, or the fox becoming your ally once the parent is found.
* **Does the hurt-and-retreat rule fit the new camera?** The tells assume the player can see the fox most of the time. In a
  shoulder camera it will often be at the edge of the screen or behind the camera, so the glow and sound have to do more of the work.
* **Is a hunter in the map something you want at all, or is the map better left calm until the boss?** The model and sheets cost
  nothing to keep either way.
