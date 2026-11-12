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
6. **Theme** (Edit theme on the game page): **Background image** `brand/itchbg.jpg` (2560 × 2160), set to **don't repeat**,
   position **top center**, background colour `#05060c` (so the page below the picture stays the same night). itch.io shows
   it at its real size behind a 960 px column, so on most screens only a strip of 250–480 px shows on each side: the art
   lives in those strips. Left: the five 2D guardians, named, with the blob family at the bottom. Right: windows into the
   3D world with X, the Collector and the Mash. Gold seams run along the column's edges.
   **Embed background** (Edit game → Embed options): `brand/itchembed.jpg` (780 × 1688, twice the 390 × 844
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
- The sprites come from `tools/sprites.ts`: `npm run gallery && node tools/brand/sprites.mjs` saves them to `tools/brand/sprites/`
  (the `-hd` ones are the 3D bosses at full size with smooth edges, X among them, for the videos).
- `cover.png`: itch.io cover. The flat 2D forest on the left, the 3D world tearing through on the right.
- `banner.png`: itch.io page banner.
- `itchbg.jpg` and `itchembed.jpg`: the itch.io page background and embed background (see the upload steps above).
- `icon.png`: 1080 square mark, for an Instagram profile picture or an app icon.
- `screens/`: real gameplay screenshots (1080 × 1920) with the HUD, one per boss plus the opening: the bots in `src/dev`
  play each fight and `node tools/screens/shoot.mjs <outDir> [scene ...]` captures bursts to choose from (after
  `npm run build:standalone`). `screens/framed/` is the same shots in a frame with a hook line above, made by
  `node tools/screens/frame.mjs` from the lines in `tools/screens/picks.json`.

## The wallpaper pack (the download that asks for a tip)
A browser game is never downloaded, so itch.io never shows its players the "$0 or donate" prompt. The wallpaper pack is the
free download that does: fifteen wallpapers, each for a 4K desktop (3840 x 2160) and a phone (1440 x 3120; the three pink ones
2160 x 3840).
```bash
npm run gallery && node tools/brand/sprites.mjs x-4k x-bust-4k collector-4k mash-4k   # once: the 3D bosses, large
node tools/brand/wallpapers.mjs                # brand/wallpapers/desktop, brand/wallpapers/phone, the-third-direction-wallpapers.zip
node tools/brand/wallpapers.mjs aurora --preview   # one of them, at a quarter of the size, to look at a change
```
All of it is drawn by `tools/brand/wallpapers.html` (WebGL shaders and a 2D canvas, from the game's own sprites); a sheet of all
fifteen is `brand/wallpapers/contact.jpg`. Crimson King (X in black and gold on a red void), Liquid Gold (abstract ink and gold
veins), The Third Axis (minimal: the mark), Shatter (the flat world as breaking glass), Neon Signs (all eight bosses), Moonrise
(pixel art), Kaleidoscope (a mandala of the guardians), Survey Map (the forest as a contour chart), Pop Art (halftone prints),
Signal Lost (glitch), Rising (isometric columns), Aurora (five curtains of light), and three in pink: Pink Blob (the blob on
satin), Pink Hollow (X in a rose aura), Pink Dusk (the family on their hill at sunset, X's eyes in the sky).

**On itch.io:** Edit game → Uploads → add `the-third-direction-wallpapers.zip` (do not tick "played in the browser"; name it
"Wallpaper pack (4K + phone)"). The page then shows a Download button, and the donation prompt with it.

## Web game sites (ad revenue share)
Check each site's current developer docs before uploading; their requirements change.

**Rewarded ads (every portal build):** when the player falls, a site with a rewarded ad ready offers it ("You fell: watch a
short ad to get back up right here, with all your hearts"). Watched to the end, the player gets up where they fell with full
hearts and the fight goes on as it was (it does not count as a fall); "No thanks", or no ad ready, and they wake at the
checkpoint as always. Never in the tutorial. The offer and the ad do not count on the run's clock. Each `src/sdk.*.ts` has a
`rewardedOffer()` (see `src/core/rewarded.ts`): GameDistribution preloads one (`preloadAd('rewarded')`, earned at
`SDK_REWARDED_WATCH_COMPLETE`), Y8 offers it only when it has one (`showAd({ type: 'reward' })`: `beforeReward`, earned at
`adViewed`), CrazyGames asks for one when the player says yes (`requestAd('rewarded')`, earned at `adFinished`). itch.io, RUN
and the Artifact have none, so nothing changes there.

### CrazyGames (the main earner)
```bash
npm run build:crazygames
```
This makes `dist-crazygames/` and `the-third-direction-crazygames.zip` (about 0.5 MB, well under their 50 MB limit and the 20 MB
limit for their mobile homepage). `vite.crazygames.config.ts` swaps `src/sdk.ts` for `src/sdk.crazygames.ts`, which uses their
HTML5 SDK v3 (the page loads it from `sdk.crazygames.com`):
- **Loading:** `loadingStart` when the game starts loading, `loadingStop` once the SDK is ready and the home page can show.
- **Gameplay:** `gameplayStart` / `gameplayStop` whenever a run starts, pauses, ends or goes back to the menu
  (`Game.syncGameplay`).
- **Ads:** a midgame ad only at natural breaks: **Play**, **Play again**, and a boss picked in **Fight a boss**
  (`Game.afterBreak`). Never in a fight. The game is paused and silent while the ad plays and goes on when it ends, fails or
  is not filled (and after 40 s at most). The sound is started inside the tap first, because phones allow it nowhere else.
- **Mute:** their mute button (the SDK's `muteAudio` setting and its change listener) silences the game at the very end of
  its audio chain (`Sfx.setSiteMuted`), on top of the player's own sound switch, which it leaves as it was. Tick "supports
  CrazyGames muting audio through SDK" when uploading.
- **Saves:** their data module, so saves follow a signed-in player, with localStorage as the fallback. **Happy time** on a
  full clear. No share link (the share button does nothing there).
- **Without the SDK** (offline, blocked) every call does nothing and the game plays as usual.
- **Instant play** (`INSTANT` in the SDK module): CrazyGames wants a new player in gameplay at once (one click at most). Someone who
  has never played starts a run as the page opens: no splash, no intro film, no home page, no opening scene. The hero's name and the
  story come as captions over the glade while the blob can already move, then the tutorial. The sound starts with the first tap or key
  (browsers allow it nowhere else). A returning player (tutorial done, or a run saved) gets the home page. `?instant` tries it on any build.
- **Desktop:** most of their players are on a computer, in landscape. Around the tall frame of the game the page shows the guardians and
  the 3D bosses (`brand/crazygames/desktop-bg.jpg`, cut from the itch.io background, scaled to the height so the art always meets the
  frame) instead of black bars.

In the RUN, itch.io and preview builds, `adBreak()` returns null and `gameplay()` does nothing, so Play starts in the same tap.

**Submitting:** CrazyGames Developer Portal → Submit game → HTML5, upload the zip. Orientation **portrait**, mobile
**yes** (touch controls are built in). Covers: `brand/crazygames/landscape.jpg` (1920 × 1080), `portrait.jpg` (800 × 1200),
`square.jpg` (800 × 800), made by `node tools/brand/render.mjs cglandscape cgportrait cgsquare`; if the portal asks for other
sizes, change them there. They also want two preview videos (MP4, at most 20 s), shown when a player hovers over the cover:
`brand/crazygames/preview-landscape.mp4` (1920 × 1080) and `preview-portrait.mp4` (1080 × 1620: they want 2:3, not 9:16) (16.8 s of gameplay, no text), made by `tools/brand/previews.sh`.
The first submission was turned down for overall quality (new players waited through a splash, the film, the home page and the
opening before they could move, and the frame stood in black bars on a desktop). Their FAQ allows a resubmission after meaningful
improvements; the second one added instant play, the desktop art, the tutorial and the Moth Meadow fixes.

A new game starts in **Basic Launch** (a test with real players); if it does well they offer **Full Launch**, which is where the
SDK and the ad revenue matter. This build already has the SDK in, so nothing needs to change then.

### GameDistribution (ads across hundreds of sites)
```bash
GD_GAME_ID=<the game id from their control panel> npm run build:gamedistribution
```
The Third Direction's Game ID there is `c1d77f81534f43ea96746726c7218a59` (account TheThird; it is public, it ships in the page).
This makes `dist-gamedistribution/` and `the-third-direction-gamedistribution.zip`. `vite.gamedistribution.config.ts` swaps in
`src/sdk.gamedistribution.ts` and puts their HTML5 SDK in the page (`html5.api.gamedistribution.com/main.min.js`, with
`window.GD_OPTIONS`: the id, and an `onEvent` that hands every event to the game). The build refuses to run without a 32-character id.
- **Ads** only at the natural breaks, always after a tap (Play, Continue, Play again, a boss picked; never in a fight): a pre-roll
  the first time, mid-rolls after, as often as their SDK allows. The game is paused and silent from SDK_GAME_PAUSE to SDK_GAME_START
  (and goes on if the ad fails, or after 40 s at most).
- **Saves** in localStorage; no share link. On a desktop the page shows the CrazyGames desktop art around the frame.
- **Without the SDK** every call does nothing and Play starts in the same tap.

**Uploading:** gamedistribution.com → developer sign-up → create the game (HTML5) to get its **Game ID** → build with it → upload the
zip. Their portal activates the integration once the pre-roll has been watched to the end in the upload page's preview.

### Y8 (a self-serve upload with its own players)
```bash
npm run build:y8
```
This makes `dist-y8/` and `the-third-direction-y8.zip`. `vite.y8.config.ts` swaps in `src/sdk.y8.ts` and puts Y8's minimal SDK in
the page from their CDN (`cdn.y8.com/minimal-sdk/2-0/y8.min.js`; they ask for it never to be bundled), started with the game's
**App ID** and **Game ID** from the developer portal (Builds -> SDK Initialization; set in the config, or `Y8_APP_ID` /
`Y8_GAME_ID`).
- **Ads** only at the natural breaks, always after a tap (Play, Continue, Play again, a boss picked; never in a fight): a "start"
  break the first time, "next" after, as often as Y8 allows. The game is paused and silent from their beforeAd to afterAd, and goes
  on when the break is done (or if the ad fails, or after 40 s at most).
- **Instant play** as on CrazyGames (a new player starts a run as the page opens; a returning one gets the home page).
- **Saves** in localStorage. The share button shares the run with the Y8 page it was played on, never a link to another site.
  On a desktop the page shows the CrazyGames desktop art around the frame.
- **Without the SDK** every call does nothing and Play starts in the same tap.

**Uploading:** developer.y8.com -> the game -> Builds: upload the zip, then run their QA (it checks the SDK and the ads). Give it
a **landscape frame (960 x 540)** so desktop players see the art around the game, tick mobile if offered, and use
`brand/cover.png` as the thumbnail. The studio logo is `brand/y8/studio-logo.png` (175 x 175).

### Newgrounds
Upload `the-third-direction-web.zip` (the itch.io build) as an HTML5 game; no SDK is needed. Set the size to **390 × 844**
(portrait), tick mobile friendly if offered, and use `brand/cover.png` as the icon (crop it in their uploader). The audience
there likes boss rushes and pixel art; the money is small, the players and comments are worth it.

### Poki
They choose which games they take: apply through their developer form first. They usually want the game only on their site
(web exclusivity), so check that before putting it on CrazyGames as well. If they say yes, a Poki build is made the same way
as the CrazyGames one (a `src/sdk.poki.ts` and its own config).
