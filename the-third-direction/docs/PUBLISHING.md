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
   `brand/banner.png`. Screenshots: 3–5 shots from the trailer stills (portrait is fine).
6. Save as **Draft**, play it on a phone and a computer, then set it to **Public**.

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
- `logo.png`: the logo on a transparent background. The mark is the blob at the corner of three axes: two lie flat (teal),
  the third goes up (gold). That is the game's idea: a flat world that finds a third direction.
- `cover.png`: itch.io cover. The flat 2D forest on the left, the 3D world tearing through on the right.
- `banner.png`: itch.io page banner.
- `icon.png`: 1080 square mark, for an Instagram profile picture or an app icon.

## Web game sites (ad revenue share)
Check each site's current developer docs before building for it; requirements change.
- **CrazyGames:** apply on their developer portal. They ask you to add their SDK (ads, game start / stop events) and test it
  in their preview tool. Ads go only between fights or after a death, never during play.
- **Poki:** apply through their developer form; they choose which games they take, and they usually want the game only on
  their site (web exclusivity). Check that before putting the game on other portals.
- **Newgrounds:** upload the same zip; no SDK needed to start. Ad revenue share is small but the audience likes games like this.

A portal build would get its own SDK module (`src/sdk.crazygames.ts` or similar) and config, the same way as the web build,
so the RUN and itch.io builds stay as they are.
