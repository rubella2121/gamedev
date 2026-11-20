// Real gameplay for the portfolio card's preview (brand/portfolio-card): every boss, wide 16:9, played by the game's bots,
// with the Blob as it is (no skin).
//   npm run build:standalone && node tools/trailer/capture.mjs dist-standalone tools/trailer/shots-card.mjs <outDir> [shot ...]
// The 1280 x 720 page gives the game its wide view (684 x 384 pixels in the forest). The forest shots keep its own pixels
// (`pix`, see capture.mjs) with the HUD off, so the edit can crop in on the action and scale it up sharp.
// The footage is 60 frames a second with the game running 1.3 times as fast as it plays (each frame moves it on 1.3/60 s):
// smooth, and quick enough for a loop that has to show eight bosses in about thirteen seconds.
const SPEED = 1.3;
const DT = SPEED / 60;
const frames = (gameSeconds) => Math.round(gameSeconds / DT);
const begin = '__tt.begin(); __tt.act1.skipOpening();';
// (the 3D is drawn at about the video's own size: 5.3e5 pixels)
const WIDE = { viewport: [1280, 720], budget: 5.3e5, skin: 'default', dt: DT };
const NOHUD = '__tt.act1.drawHud = () => {}; __tt.act1.drawCompass = () => {};';
const UNTIL3 = "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control";

// a guardian fight, played by the bot from the moment the guardian is up
const fight = (id, seconds = 9) => ({
  name: `c-fight-${id}`,
  ...WIDE,
  pix: true,
  setup: `${begin} __bot.run('${id}', 1)`,
  atStart: NOHUD,
  until: `(() => { const z = __tt.act1.zones.find((q) => q.guardian && q.guardian.state !== 'gone'); return z && z.guardian.state === 'fight' })()`,
  frames: frames(seconds),
});
// a 3D fight played by the bot, seen through the game's own camera (what a player sees)
const fight3d = (id, b, seconds = 4.6) => ({
  name: `c-3d-${id}`,
  ...WIDE,
  setup: `__bot3.run(${b}, 0, 1)`,
  until: UNTIL3,
  warm: 20,
  frames: frames(seconds),
});

export const SHOTS = [
  // the five guardians of the forest
  fight('gloom'),
  fight('thicket'),
  fight('marsh'),
  fight('bones'),
  fight('meadow'),
  // the Edge: X's eyes over the forest, then the world tears open onto the 3D world behind it (26.6 s to 30 s of the scene)
  {
    name: 'c-edge',
    ...WIDE,
    pix: true,
    budget: 6.5e5,
    atStart: NOHUD,
    setup: '__tt.playEdge()',
    until: "__tt.act1.mode !== 'opening'",
    warm: frames(26.6),
    frames: frames(3.4),
  },
  // the three bosses of the third dimension
  fight3d('x', 0),
  fight3d('collector', 1),
  fight3d('mash', 2, 5.5),
];
