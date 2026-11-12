// The skins in action, for the song edit (trailer-video/src/edits/SkinsEdit.tsx): every shot is the real game with the Blob
// in one of the skins (`skin`), and the Blob on a layer of its own (`layers`, see capture.mjs) for the edit's effects.
//   npm run build:standalone && node tools/trailer/capture.mjs dist-standalone tools/trailer/shots-skins.mjs <outDir> [shot ...]
const begin = "__tt.begin(); __tt.act1.skipOpening();";
const HI = { viewport: [720, 1280], budget: 9.3e5 };
const UNTIL3 = "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control";
const GLOWS = ['inferno', 'golden'];

/* ------------------------------------------------------------------------------------------------ the forest (2D) */

// a guardian fight, played by the bot from the moment the guardian is up
const fight2d = (id, skin, frames = 420) => ({
  name: `e-f-${id}-${skin}`,
  skin,
  layers: '2d',
  setup: `${begin} __bot.run('${id}', 1)`,
  until: `(() => { const z = __tt.act1.zones.find((q) => q.guardian && q.guardian.state !== 'gone'); return z && z.guardian.state === 'fight' })()`,
  frames,
});
// running about a place, pulsing now and then
const run2d = (id, skin, frames = 150) => ({
  name: `e-z-${id}-${skin}`,
  skin,
  layers: '2d',
  setup: `${begin} __tt.act1.warp('${id}')`,
  until: '__tt.act1.mode === "play"',
  warm: 10,
  each: "const i = __tt.input; const t = __tt.act1.time; i.joyX = Math.sin(t * 0.7) * 0.8; i.joyY = -0.6 + Math.cos(t * 0.5) * 0.3; if (Math.floor(t * 1.4) !== Math.floor((t - 1/30) * 1.4)) { i.keys.add(' '); setTimeout(() => i.keys.delete(' '), 40); }",
  frames,
});

/* ------------------------------------------------------------------------------------------------ the Crater (3D) */

/**
 * a camera that circles the Blob: from angle a0 to a1 (radians round from its face), from distance r0 to r1, at height h,
 * looking at `lift` above its feet
 */
const orbit = (n, a0, a1, r0, r1, h, fov, lift) =>
  `window.__f = 0; __tt.beforeDraw = () => { const a = __tt.act2.arena, c = a.camera, p = a.player.position;
   const u = Math.min(1, window.__f++ / ${n}); const s = u * u * (3 - 2 * u); const ry = a.player.rotation.y;
   const an = ry + ${a0} + (${a1} - ${a0}) * s, r = ${r0} + (${r1} - ${r0}) * s;
   c.position.set(p.x + Math.sin(an) * r, p.y + ${h}, p.z + Math.cos(an) * r); c.lookAt(p.x, p.y + ${lift}, p.z);
   c.fov = ${fov}; c.updateProjectionMatrix(); }`;
const cam = (n, p0, p1, l0, l1, f0 = 50, f1 = f0) =>
  `window.__f = 0; __tt.beforeDraw = () => { const c = __tt.act2.arena.camera; const u = Math.min(1, window.__f++ / ${n}); const s = u * u * (3 - 2 * u);
   const L = (a, b) => a + (b - a) * s;
   c.position.set(L(${p0[0]}, ${p1[0]}), L(${p0[1]}, ${p1[1]}), L(${p0[2]}, ${p1[2]})); c.lookAt(L(${l0[0]}, ${l1[0]}), L(${l0[1]}, ${l1[1]}), L(${l0[2]}, ${l1[2]}));
   c.fov = L(${f0}, ${f1}); c.updateProjectionMatrix(); }`;
// the Crater with the boss held in its entrance (nothing attacks), the Blob unhurt where it landed; `hide` takes the boss out of
// the picture and `clean` the claw off the Blob's side (for the close-ups)
const calm = (name, skin, frames, camera, o = {}) => ({
  name,
  skin,
  layers: '3d',
  glow: GLOWS.includes(skin),
  setup: `__tt.debugFight(0, ${o.boss ?? 0})`,
  until: UNTIL3,
  atStart: `__tt.act2.hurt = () => {}; ${camera}`,
  each: [
    "{ const b = __tt.act2.boss; b.state = 'intro'; b.st = 0; }",
    o.hide ? '{ const r = __tt.act2.boss.flattenRoot(); if (r) r.visible = false; }' : '',
    o.clean ? '__tt.act2.arena.claw.visible = false;' : '',
  ].join(' '),
  warm: o.warm ?? 30,
  frames,
  ...HI,
  ...(o.dt ? { dt: o.dt } : {}),
});
// a fight, played by the bot, the camera low behind the Blob, close, looking up at the boss
const chase = (name, skin, b, frames = 150) => ({
  name,
  skin,
  layers: '3d',
  glow: GLOWS.includes(skin),
  setup: `__bot3.run(${b}, 0, 1)`,
  until: UNTIL3,
  warm: 20,
  frames,
  atStart:
    "__tt.beforeDraw = () => { const a = __tt.act2.arena, c = a.camera, p = a.player.position; c.position.set(p.x * 0.9 + 0.8, p.y + 1.55, p.z + 3.9); c.lookAt(p.x * 0.55, 5.2, -26); c.fov = 58; c.updateProjectionMatrix(); }",
  ...HI,
});

export const SHOTS = [
  // ---- the forest: the five guardians, each fought in a skin
  fight2d('gloom', 'golden'),
  fight2d('thicket', 'inferno'),
  fight2d('marsh', 'knight'),
  fight2d('bones', 'wizard'),
  fight2d('meadow', 'explorer'),
  // running, pulsing
  run2d('meadow', 'wizard'),
  run2d('thicket', 'explorer'),
  run2d('marsh', 'inferno'),
  // one pulse in slow motion, the light pushing the dark back
  {
    name: 'e-w-pulse-golden',
    skin: 'golden',
    layers: '2d',
    setup: `${begin} __tt.act1.warp('gloom')`,
    until: '__tt.act1.mode === "play"',
    atStart: '__tt.act1.trailerAt(300, 1240, true); window.__f = 0',
    warm: 6,
    each: "const i = __tt.input; i.joyX = -0.1; i.joyY = -0.2; if (window.__f++ === 30) { i.keys.add(' '); setTimeout(() => i.keys.delete(' '), 60); }",
    frames: 150,
    dt: 1 / 60,
  },
  // the Edge in Golden: X comes into the forest, his foot, pinned, the rift, the dive through into 3D, the fall (it stops a few
  // seconds after the 3D has taken over)
  {
    name: 'e-edge-golden',
    skin: 'golden',
    layers: '2d',
    setup: '__tt.playEdge()',
    until: "__tt.act1.mode !== 'opening'",
    budget: 6.5e5,
    frames: 2600,
    stop: "(window.__z = __tt.state !== 'act1' ? (window.__z || 0) + 1 : 0) > 150",
  },

  // ---- the Crater: each skin close, the camera coming round in front of it (X out of the picture, the claw off)
  ...['explorer', 'knight', 'wizard', 'inferno', 'golden'].map((s) => calm(`e-face-${s}`, s, 90, orbit(90, -0.7, 0.4, 8.6, 7.3, 1.25, 34, 1.3), { hide: true, clean: true })),
  // Golden all the way round, X towering behind it
  calm('e-orbit-golden', 'golden', 150, orbit(150, 0.4, 0.4 + 2 * Math.PI, 6.4, 5.6, 1.5, 44, 1.45), { clean: true }),
  // Golden from behind, small, looking up the length of X
  calm('e-hero-golden', 'golden', 120, cam(120, [0.9, 1.2, 19.5], [0.3, 2.6, 15.8], [0, 10.5, -29], [0, 13.2, -29], 50, 58), { clean: true }),
  // X's foot comes down beside Inferno, in slow motion (the boss is not held: this is his attack)
  {
    name: 'e-slam-inferno',
    skin: 'inferno',
    layers: '3d',
    glow: true,
    setup: '__tt.debugFight(0, 0)',
    until: UNTIL3,
    atStart: cam(120, [0.6, 1.25, 18.6], [0.4, 1.6, 17.6], [0, 9.5, -29], [0, 11.5, -29], 54, 58),
    warm: 190,
    dt: 1 / 60,
    frames: 120,
    ...HI,
  },
  // the fights, close behind: the Knight against X, the Wizard against the Collector, the Explorer against the Mash
  chase('e-chase-knight', 'knight', 0),
  chase('e-chase-wizard', 'wizard', 1),
  chase('e-chase-explorer', 'explorer', 2),
];
