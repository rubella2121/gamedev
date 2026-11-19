// Real gameplay for the portfolio card's preview (brand/portfolio-card): wide 16:9 shots of the forest, a guardian fight, the
// fall into 3D and the 3D fights, with the Blob as it is (no skin).
//   npm run build:standalone && node tools/trailer/capture.mjs dist-standalone tools/trailer/shots-card.mjs <outDir> [shot ...]
// The 1280 x 720 page gives the game its wide view (684 x 384 pixels in the forest). The forest shots keep its own pixels
// (`pix`, see capture.mjs) with the HUD off, so the edit can crop in on the action and scale it up sharp.
const begin = '__tt.begin(); __tt.act1.skipOpening();';
const WIDE = { viewport: [1280, 720], budget: 9.3e5, skin: 'default' };
const NOHUD = '__tt.act1.drawHud = () => {}; __tt.act1.drawCompass = () => {};';
const UNTIL3 = "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control";

// running about a zone, pulsing now and then
const run = (id, frames = 120) => ({
  name: `c-run-${id}`,
  ...WIDE,
  pix: true,
  setup: `${begin} __tt.act1.warp('${id}')`,
  until: '__tt.act1.mode === "play"',
  atStart: NOHUD,
  warm: 10,
  each: "const i = __tt.input; const t = __tt.act1.time; i.joyX = Math.sin(t * 0.7) * 0.8; i.joyY = -0.6 + Math.cos(t * 0.5) * 0.3; if (Math.floor(t * 1.4) !== Math.floor((t - 1/30) * 1.4)) { i.keys.add(' '); setTimeout(() => i.keys.delete(' '), 40); }",
  frames,
});
// a guardian fight, played by the bot from the moment the guardian is up
const fight = (id, frames = 240) => ({
  name: `c-fight-${id}`,
  ...WIDE,
  pix: true,
  setup: `${begin} __bot.run('${id}', 1)`,
  atStart: NOHUD,
  until: `(() => { const z = __tt.act1.zones.find((q) => q.guardian && q.guardian.state !== 'gone'); return z && z.guardian.state === 'fight' })()`,
  frames,
});
// a 3D fight played by the bot, seen through the game's own camera (what a player sees)
const fight3d = (name, b, frames = 150, warm = 20) => ({
  name,
  ...WIDE,
  setup: `__bot3.run(${b}, 0, 1)`,
  until: UNTIL3,
  warm,
  frames,
});

export const SHOTS = [
  run('gloom'),
  run('meadow'),
  fight('gloom'),
  fight('thicket'),
  fight('bones'),
  // the Edge: X comes into the forest, the rift, the dive through into 3D (it stops a few seconds after the 3D takes over)
  {
    name: 'c-edge',
    ...WIDE,
    pix: true,
    budget: 6.5e5,
    atStart: NOHUD,
    setup: '__tt.playEdge()',
    until: "__tt.act1.mode !== 'opening'",
    frames: 2600,
    stop: "(window.__z = __tt.state !== 'act1' ? (window.__z || 0) + 1 : 0) > 120",
  },
  fight3d('c-3d-x', 0),
  fight3d('c-3d-collector', 1, 100),
  fight3d('c-3d-mash', 2),
];
