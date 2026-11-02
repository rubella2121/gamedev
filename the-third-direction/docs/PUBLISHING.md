# Publishing outside RUN (itch.io and web game sites)

## The web build
```bash
npm run build:web
```
This makes `dist-web/` and `the-third-direction-web.zip` (about 0.5 MB). It is the same game as the RUN build, with three differences
(`vite.web.config.ts` swaps `src/sdk.ts` for `src/sdk.web.ts`):
- Saves (settings, best times, progress) go to the browser's localStorage, under keys starting with `ttd:`. If the browser blocks
  storage, they last for the visit.
- No leaderboard. Sharing uses the phone's share sheet, or copies the text and link on a computer.
- The credit line under the title and on the end card reads "a boss rush in three directions" instead of the jam name.
  Each build sets it as `CREDIT` in its SDK module.

Three.js is bundled in, so the zip runs on its own with no outside downloads.

## itch.io: uploading
1. itch.io → Dashboard → **Create new project**.
2. **Kind of project:** HTML. Upload `the-third-direction-web.zip` and tick **This file will be played in the browser**.
3. **Embed options:** viewport **390 × 844** (a phone in portrait), tick **Mobile friendly** (orientation: portrait),
   **Fullscreen button**, and **Automatically start on page load** off (the game has its own "tap to begin").
4. **Pricing:** **$0 or donate**, with a suggested donation of **$3**. The game stays free and fans can tip.
5. **Cover image:** `brand/cover.png` (1260 × 1000, the 630 × 500 shape at twice the size). **Banner** (Edit theme → Banner):
   `brand/banner.png`. **Screenshots:** pick 4–5 from `brand/screens/` (plain gameplay) or `brand/screens/framed/`
   (the same shots with a hook line). A good set: the family, the Toll Queen, X, the Collector, the Mash.
6. **Theme** (Edit theme on the game page): **Background image** `brand/itchbg.jpg`, set to **don't repeat**, position
   **top center**, background colour `#05060c` (so the page below the picture stays the same night). The art sits just
   outside the page column: the flat world on the left, the 3D world on the right, more bosses at the far edges for wide
   screens. **Embed background** (Edit game → Embed options): `brand/itchembed.jpg` (780 × 1688, twice the 390 × 844
   frame; itch.io takes images up to 3840 × 2160), shown behind the Run game button.
7. Save as **Draft**, play it on a phone and a computer, then set it to **Public**.

## itch.io: page text

**Title:** The Third Direction

**Short description** (shown under the title, about 100 characters):
> A baby blob, a forest of monsters, and a world that was never flat. Look up.

**Genre:** Action · **Tags:** boss-rush, pixel-art, 3d, horror, cute, monsters, singleplayer, short, mobile, atmospheric

**Description:**
> **Something took your family. The forest knows where.**
>
> You are a tiny blob of light in a dark forest full of strange monsters. Walk in any direction. Five zones, five guardians,
> each with its own attacks, phases and weak point: the **Gloommother**, the **Thornback King**, the **Toll Queen**,
> the **Bone Wyrm** and the **Mimic Queen**.
>
> Beat them, reach the Edge… and find out the world was never flat. 🌕
>
> **What's inside**
> - A hand-made pixel forest that breaks open into a full **3D arena**
> - **8 bosses**, and every monster has its own voice
> - A moth friend that shields you, guides you to secrets, and has a story of its own
> - **Gentle, Normal and Nightmare** difficulties, best times, and secrets that give bonus hearts
> - One thumb to play: a joystick and one button (tap, hold, double-tap)
>
> **Controls**
> - Phone: drag on the left to move, use the button on the right
> - Keyboard: WASD / arrows to move, Space to attack (hold for the Light Lance, double-tap to dash), Q / E to turn the camera in 3D
>
> Best with sound on. 🎧
>
> *If you enjoyed it, a small tip helps me make the next boss.* ❤️

## Brand art
`brand/` holds the logo and store art, drawn by `tools/brand/brand.html` and saved by `node tools/brand/render.mjs`
(or `node tools/brand/render.mjs cover` for one piece). The game shots come from the trailer footage (`tools/brand/img/`),
and the fonts (Boldonse, Big Shoulders) are under the SIL Open Font License, so they are free to use in a paid game.
- `logo.png`: the full logo on a transparent background (2400 × 1900). X's three eyes open above, the other seven bosses
  stand in an arc behind the title (the five forest guardians from the game's own pixel painter, the Collector and the Mash
  as their real 3D models drawn small to match), and the blob family waits in front, looking up. Only soft glows behind,
  so it sits on any colour. `logo-on-night.jpg` is the same on the game's night colour, for posting.
- `wordmark.png`: the title alone with the mark (the blob at the corner of three axes, the third going up), for small sizes.
- The sprites come from `tools/sprites.ts`: `npm run gallery && node tools/brand/sprites.mjs` saves them to `tools/brand/sprites/`.
- `cover.png`: itch.io cover. The flat 2D forest on the left, the 3D world tearing through on the right.
- `banner.png`: itch.io page banner.
- `itchbg.jpg` and `itchembed.jpg`: the itch.io page background and embed background (see the upload steps above).
- `icon.png`: 1080 square mark, for an Instagram profile picture or an app icon.
- `screens/`: real gameplay screenshots (1080 × 1920) with the HUD, one per boss plus the opening: the bots in `src/dev`
  play each fight and `node tools/screens/shoot.mjs <outDir> [scene ...]` captures bursts to choose from (after
  `npm run build:standalone`). `screens/framed/` is the same shots in a frame with a hook line above, made by
  `node tools/screens/frame.mjs` from the lines in `tools/screens/picks.json`.

## Web game sites (ad revenue share)
Check each site's current developer docs before building for it; requirements change.
- **CrazyGames:** apply on their developer portal. They ask you to add their SDK (ads, game start / stop events) and test it
  in their preview tool. Ads go only between fights or after a death, never during play.
- **Poki:** apply through their developer form; they choose which games they take, and they usually want the game only on
  their site (web exclusivity). Check that before putting the game on other portals.
- **Newgrounds:** upload the same zip; no SDK needed to start. Ad revenue share is small but the audience likes games like this.

A portal build would get its own SDK module (`src/sdk.crazygames.ts` or similar) and config, the same way as the web build,
so the RUN and itch.io builds stay as they are.
