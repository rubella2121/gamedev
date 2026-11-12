// The skins in action, for the song edit (trailer-video/src/edits/SkinsEdit.tsx): every shot is the real game with the Blob
// in one of the skins (`skin`, see capture.mjs).
//   npm run build:standalone && node tools/trailer/capture.mjs dist-standalone tools/trailer/shots-skins.mjs <outDir> [shot ...]
const begin = "__tt.begin(); __tt.act1.skipOpening();";
const HI = { viewport: [720, 1280], budget: 9.3e5 };
const UNTIL3 = "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control";

/**
 * a camera that circles the Blob, in front of it: from angle a0 to a1 (radians round from its face), from distance r0 to r1,
 * at height h, looking at its middle (`lift` higher for a skin that is tall)
 */
const orbit = (n, a0, a1, r0, r1, h, fov, lift = 0.85) =>
  `window.__f = 0; __tt.beforeDraw = () => { const a = __tt.act2.arena, c = a.camera, p = a.player.position;
   const u = Math.min(1, window.__f++ / ${n}); const s = u * u * (3 - 2 * u); const ry = a.player.rotation.y;
   const an = ry + ${a0} + (${a1} - ${a0}) * s, r = ${r0} + (${r1} - ${r0}) * s;
   c.position.set(p.x + Math.sin(an) * r, p.y + ${h}, p.z + Math.cos(an) * r); c.lookAt(p.x, p.y + ${lift}, p.z);
   c.fov = ${fov}; c.updateProjectionMatrix(); }`;
// the Crater with the boss held in its entrance (nothing attacks), the Blob unhurt where it landed
const calm = (name, skin, frames, camera, o = {}) => ({
  name,
  skin,
  setup: `__tt.debugFight(0, ${o.boss ?? 0})`,
  until: UNTIL3,
  atStart: `__tt.act2.hurt = () => {}; ${camera}`,
  each: ["{ const b = __tt.act2.boss; b.state = 'intro'; b.st = 0; }", o.hide ? '{ const r = __tt.act2.boss.flattenRoot(); if (r) r.visible = false; }' : ''].join(' '),
  warm: o.warm ?? 30,
  frames,
  ...HI,
  ...(o.dt ? { dt: o.dt } : {}),
});
// a fight, played by the bot, the camera behind the Blob looking at the boss
const chase = (name, skin, b, frames = 150) => ({
  name,
  skin,
  setup: `__bot3.run(${b}, 0, 1)`,
  until: UNTIL3,
  warm: 20,
  frames,
  atStart:
    "window.__f = 0; __tt.beforeDraw = () => { const a = __tt.act2.arena, c = a.camera, p = a.player.position; c.position.set(p.x * 0.85 + 1.2, p.y + 2.3, p.z + 5.6); c.lookAt(p.x * 0.4, 7.5, -26); c.fov = 56; c.updateProjectionMatrix(); }",
  ...HI,
});
const cam = (n, p0, p1, l0, l1, f0 = 50, f1 = f0) =>
  `window.__f = 0; __tt.beforeDraw = () => { const c = __tt.act2.arena.camera; const u = Math.min(1, window.__f++ / ${n}); const s = u * u * (3 - 2 * u);
   const L = (a, b) => a + (b - a) * s;
   c.position.set(L(${p0[0]}, ${p1[0]}), L(${p0[1]}, ${p1[1]}), L(${p0[2]}, ${p1[2]})); c.lookAt(L(${l0[0]}, ${l1[0]}), L(${l0[1]}, ${l1[1]}), L(${l0[2]}, ${l1[2]}));
   c.fov = L(${f0}, ${f1}); c.updateProjectionMatrix(); }`;
const fight2d = (id, skin, frames = 300) => ({
  name: `k-f-${id}-${skin}`,
  skin,
  setup: `${begin} __bot.run('${id}', 1)`,
  until: `(() => { const z = __tt.act1.zones.find((q) => q.guardian && q.guardian.state !== 'gone'); return z && z.guardian.state === 'fight' })()`,
  frames,
});

export const SHOTS = [
  // each skin, close: the camera comes round in front of it and in (the Crater behind; X held off, out of the picture)
  ...['explorer', 'knight', 'wizard', 'inferno', 'golden'].map((s) => calm(`k-face-${s}`, s, 75, orbit(75, -0.6, 0.35, 6.6, 5.3, 1.5, 40, s === 'wizard' || s === 'inferno' ? 1.3 : 1.0), { hide: true })),
  // Inferno, all the way round, X towering behind it
  calm('k-orbit-inferno', 'inferno', 150, orbit(150, 0.4, 0.4 + 2 * Math.PI, 5.2, 4.4, 1.7, 46, 1.4)),
  // Golden from behind, small, looking up the length of X (crown and cape)
  calm('k-hero-golden', 'golden', 120, cam(120, [0.9, 1.2, 19.5], [0.3, 2.6, 15.8], [0, 10.5, -29], [0, 13.2, -29], 50, 58)),
  // X's foot comes down beside Inferno, in slow motion (the boss is not held: this is his attack)
  { name: 'k-slam-inferno', skin: 'inferno', setup: '__tt.debugFight(0, 0)', until: UNTIL3, atStart: cam(120, [0.6, 1.25, 18.6], [0.4, 1.6, 17.6], [0, 9.5, -29], [0, 11.5, -29], 54, 58), warm: 190, dt: 1 / 60, frames: 120, ...HI },
  // the fights, from behind: the Knight against X, the Wizard against the Collector, the Explorer against the Mash
  chase('k-chase-knight', 'knight', 0),
  chase('k-chase-wizard', 'wizard', 1),
  chase('k-chase-explorer', 'explorer', 2),
  // the forest: Golden and Inferno against two guardians; the Wizard running; the Knight's pulse in slow motion
  fight2d('gloom', 'golden'),
  fight2d('thicket', 'inferno'),
  {
    name: 'k-z-meadow-wizard',
    skin: 'wizard',
    setup: `${begin} __tt.act1.warp('meadow')`,
    until: '__tt.act1.mode === "play"',
    warm: 10,
    each: "const i = __tt.input; const t = __tt.act1.time; i.joyX = Math.sin(t * 0.7) * 0.8; i.joyY = -0.6 + Math.cos(t * 0.5) * 0.3; if (Math.floor(t * 1.4) !== Math.floor((t - 1/30) * 1.4)) { i.keys.add(' '); setTimeout(() => i.keys.delete(' '), 40); }",
    frames: 120,
  },
  {
    name: 'k-w-pulse-knight',
    skin: 'knight',
    setup: `${begin} __tt.act1.warp('gloom')`,
    until: '__tt.act1.mode === "play"',
    atStart: '__tt.act1.trailerAt(300, 1240, true); window.__f = 0',
    warm: 6,
    each: "const i = __tt.input; i.joyX = -0.1; i.joyY = -0.2; if (window.__f++ === 36) { i.keys.add(' '); setTimeout(() => i.keys.delete(' '), 60); }",
    frames: 150,
    dt: 1 / 60,
  },
];
