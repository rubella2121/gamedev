# THE THIRD DIRECTION: FINAL SCRIPT (v3.1)

> **v4 note:** Act I is no longer a straight corridor. It is an open forest with five zones you can do in any order, a light-pulse attack,
> hearts, more monsters and puzzles, and a bigger 3D arena with a free camera. The story beats below still hold. The new structure is
> described in [`OPEN_FOREST_DESIGN.md`](./OPEN_FOREST_DESIGN.md).
>
> **v5 note:** Every zone now ends in a **guardian fight** (Gloommother, Thornback King, Toll Queen, Bone Wyrm, Mimic Queen), and the
> 3D arena holds **three bosses in a row**: X, then **The Collector** (the one behind the wall, who wanted you pinned with a label),
> then **The Mash** (every guardian you beat, stitched together by X, with a scorpion tail). The player gains a **Light Lance**
> (hold, let go), a **Nova** (hold longer with three full light orbs) and a **dash** (double-tap), all on the one button. The 3D arena
> gives you healing wells, surge pads and light crystals. The "four phases" fight described below is X's part of it; the other two
> bosses are described in [`docs/3D-BOSSES.md`](./docs/3D-BOSSES.md) and the concept art in `concept-art/`.

> **v6 note:** The game now has a full caption layer in three voices (the blob's thoughts, Mother and Father, and the world), with
> name cards for each zone. Every line, in order, is in [`docs/STORY.md`](./docs/STORY.md) (generated from `src/core/story.ts`), so the
> "all the words in the game" list at the bottom of this file is out of date.

> **v7 note:** The Mournmoth now does things: a Moth Shield (it takes the first hit of every fight), it points at hidden warmths, it rests on
> your head, and it goes home to the moon at the end (it is the moon's child). See `src/core/mothbond.ts` and `docs/STORY.md`.

> **v8 note:** Fall rules. Nightmare: four falls in one boss fight start it over from phase 1 (counter on screen). Normal and Gentle: three falls
> in the same phase call the moth's Second Wind (one more heart, longer windows) for that phase. See `src/core/falls.ts`.

A baby blob loses its family, crosses a forest of strange monsters, and discovers the third dimension. The monster that hunts it, **X, "The Hollow"**, is stitched together from the creatures you meet.

**Playtime** (estimates, to be verified by playtesting):
- **Interactive:** about 9:40 on a clean run, and **10–12 minutes** on a typical first run with deaths. A skilled run is about 8–9.
- **Total with cutscenes:** about **12–14 minutes**.

## Locked rules
- **Look:** a moonlit pixel-art forest in an angled top-down view. The blob glows yellow and is the warmest thing on screen. Red means X and danger.
- **X is never seen whole in 2D.** You only see his foot (a black oval with a red rim), his claws (spikes bursting from the ground) and his red eyes.
- **Controls:**
  - **Move:** WASD or arrow keys, or a touch joystick.
  - **Action:** one contextual button (Space, or an on-screen button). Hold it in 2D to free the Mournmoth or look up, and tap it in 3D to Strike.
  - Each hint appears only when the action is available, then disappears.
- **Death:** one second of black, then you retry from the start of that encounter. There are no game-over screens.
- **Sound:** crickets, wind, a heartbeat as X nears, and a drone that builds. There's total silence before the boom, and one distinct sound per monster.
- **Hooks for voters:**
  - A glitch teaser at about 1:45.
  - A main menu with **Start Game** and **Quick Showcase**, which jumps to the boom and the boss fight. Build it last.

## The monsters

| Monster | Act 1 (flat) | Becomes in X (3D) |
|---|---|---|
| **Gloomlings** (cyan eyes) | A shadow swarm. Stay in glowing flower patches or they swarm you. | His black armour, which falls off in phase 1. |
| **Rootmaws** (toothy roots) | Living thorn walls. Bait X's slam to smash them. | His jaw (fangs). |
| **Bellwethers** (floating eyes with bells) | Patrol the marsh. If they see you, the bell rings and X strikes. | His many eyes. |
| **Skitterbones** (bone-white) | A pack that pounces and herds you. | His clawed limbs. |
| **Mournmoths** (soft glow) | A friend you free. A shadow can't swallow light, so X left it trapped. | Not part of X. Its light exposes his core. |
| **Mimic Blooms** | Fake glowing flowers that snap at you. | Decoration only. |

After each encounter except the Mournmoth's, X's shadow drags the creatures in, and the slam shadow gains a new feature: eyes, teeth, crooked limbs. The player sees the boss being built.

## ACT I: THE MONSTER FOREST (0:00–6:45)

**Opening (0:00–0:30, skippable)**
- Your image, alive: three yellow blobs resting among glowing flowers. Mother nudges you. *"Don't look up."*
- A dark oval creeps over the clearing, the grass light dies and the flowers snap shut. Father shoves you towards the trees. *"Go. Don't stop."*
- The slam lands with a white flash and ringing silence. The clearing is now a round black crater, with two flat yellow smudges like pressed flowers that fade. The parents are gone.
- Silhouettes of other monsters watch from between the trees, and a bell chimes somewhere. Red eyes open. The move hint shows once.

**Encounter 1 · Gloomlings (0:30–1:45)**
- Cyan-eyed shadows crawl together and multiply in the dark. If you stand still, they swarm you.
- Sprint between glowing flower patches towards the exit. X's first slam comes from behind, which teaches you to keep moving.
- X drags the swarm into his shadow, and cyan eyes appear in it.
- **Teaser:** X's claw grazes you. For 2 seconds the forest bursts into cubes and a flash of 3D, then snaps back.

**Encounter 2 · Rootmaws (1:45–3:00), the puzzle**
- Giant toothy roots hide underground and snap shut when you come near, with a rhythm of rumble, open, snap. A wall of them seals the exit.
- Stand beside the wall until X's shadow forms, then run out of the circle. The slam destroys the Rootmaws.
- A second wall needs the same trick from a different angle. X's shadow gains a jagged, toothy rim.

**Encounter 3 · Bellwethers (3:00–4:15)**
- The Echo Marsh. Floating eyes with bells patrol, each with a vision cone. They only notice movement, so freeze in the reeds when one looks your way.
- If you're seen, the bell rings and X's slam hunts you.
- X's shadow gains eyes.

**Encounter 4 · Skitterbones (4:15–5:15)**
- A pack runs sideways on crooked legs, leaps across gaps and herds you towards a dead end.
- Read the red claw-scratch marks that show where they'll pounce, and slip through gaps in the formation. X's slam destroys the trail behind you.
- X's shadow sprouts crooked limbs.

**Encounter 5 · Mournmoths and Mimic Blooms (5:15–6:15)**
- A quiet field of glowing flowers. A Mournmoth is trapped in roots. X's shadow flinched from its glow and left it behind, because a shadow can't swallow light.
- *"Hold to free it."* It becomes your glowing companion.
- Its dust shows which flowers are real, because the fake ones twitch. Weave between the snapping Mimic Blooms. The dust also reveals the invisible edge of the world.

**The Edge (6:15–6:45)**
- The forest ends at a cliff, with pure black beyond and pixels flaking away. The music dies.
- The stars blink out one by one, and they were eyes. Three giant claw-tips lower from the sky, and X's shadow now shows every part you've met.
- *"Hold to look up."* This is the only input. Hold it, or wait 5 seconds, and X strikes.

## THE BOOM (6:45–7:05)
- White flash, then 2 seconds of total silence and one high tone.
- The screen cracks like glass, every pixel bursts into a cube, and the world rebuilds as a chunky 3D forest in the same colours.
- A claw tip breaks off and you swallow it. A black claw bursts from your side and a red third eye opens on your forehead.
- Lightning shows X whole, built from everything you met. **The title slams onto the screen.**

## ACT II: MONSTER MASH (7:05–10:40)

**The Arena (7:05–7:30)**
- A round platform of cubes floats in a violet void, with four stone pillars. Far below, the old forest hangs like a tiny flat picture.
- A curved wall around you is covered in flat 2D sprites pinned like pressed specimens. High up are two big yellow blobs.
- The Mournmoth hovers beside you. *"Strike."* The camera locks onto X.

**The Fight: X, The Hollow (7:30–10:30)**
**You have 3 hearts per phase. Lose all 3 and you restart that phase. X has 4 phases, and one successful counterattack in each phase beats it, so 4 strikes in total.** Every attack leaves X stuck for a moment, and that's your window.
1. **The Crusher:** the foot slam with swarm-covered armour. Step out of the red-rimmed shadow, then strike the stuck foot. The armour falls away.
2. **The Many-Limbed:** three skeletal arms rake across the floor. Stand in the gap, then strike the stuck claw.
3. **The Watcher:** the bells chime, his face lowers and eyes sweep a red gaze. Hide behind the pillars, which crumble. When the sweep ends he's dazed, so strike an eye.
4. **The Hollow Core:** root-jaws burst from the floor in rings, and the Mournmoth's light exposes his core. Dodge his lunge, then strike the core for the final blow.

**X Dies (10:30–10:40)**
- Slow motion. He doesn't scream. He flattens into a 2D pixel sprite and crumbles.

## ENDING (10:40–11:20)
- The pinned sprites flicker into warm lights. Most drift away into the forest, and two settle beside you.
- Cubes drift in and rebuild the original clearing in 3D, with the crater still there. Tiny monsters peek out from behind the roots.
- The camera rises towards the moon. *"I can look up now."* Then the moon blinks.
- The end card shows your time and deaths, the leaderboard, share, and play again.

**All the words in the game:** "Don't look up." / "Go. Don't stop." / the move hint (once) / "Hold to free it." / "Hold to look up." / "Strike." / "I can look up now."

## Playtest rule
Once the whole game works, have 2–3 people play without your help and time a typical first run. If it's under 10 minutes, add depth from these, in order, one prompt each:
1. A second Bellwether patrol route in Encounter 3.
2. A second flower layout in Encounter 5.
3. Boss variants: a double rake in phase 2 and a faster gaze sweep in phase 3.

## Build order and cut order
**Build the spine first,** so you always have a complete game: Opening → Rootmaws → Edge → Boom → Arena → fight (phases 1–2) → Ending. Then add the other phases and encounters. Save your final polish for the first 2 minutes and the boom, because that's what voters see.

**If you fall behind, cut in this order:**
1. Quick Showcase
2. The Mimic Blooms
3. The Gloomling light patches (a plain chase instead)
4. The Skitterbone herding (just the pounce dodge)
5. Encounter 5 (the moth then simply appears at the boom)

**Never cut:** the opening, the Rootmaws puzzle, the edge, the boom, the four-phase fight, or the ending.
