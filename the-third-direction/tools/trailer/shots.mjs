// The footage the trailer is cut from (see capture.mjs). Every shot is the real game, set up through its debug hooks.
//   setup   run once with the game's own clock (state 'menu' on arrival)
//   until   wait (wall clock) until this is true, then the capture takes the clock
//   warm    frames run but not saved;   frames  frames saved (30 a second);   each  run before every frame;   stop  end early
const begin = "__tt.begin(); __tt.act1.skipOpening();";
const guardian = (id) => ({
  name: `g-${id}`,
  setup: `${begin} __bot.run('${id}', 1)`,
  until: `(() => { const z = __tt.act1.zones.find((q) => q.guardian && q.guardian.state !== 'gone'); return z && z.guardian.state === 'intro' })()`,
  frames: 270,
});
const boss3 = (b, ph, name, frames = 165) => ({
  // (the Crater's plants and far forest are drawn: the trailer wants the place, not a test arena)
  name,
  setup: `__bot3.run(${b}, ${ph}, 1)`,
  until: "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control",
  warm: 20,
  frames,
});

// a camera of the trailer's own (3D): it glides from one place to another over n frames, after the game has moved and before it draws
const cam = (n, p0, p1, l0, l1, f0 = 50, f1 = f0) =>
  `window.__f = 0; __tt.beforeDraw = () => { const c = __tt.act2.arena.camera; const u = Math.min(1, window.__f++ / ${n}); const s = u * u * (3 - 2 * u);
   const L = (a, b) => a + (b - a) * s;
   c.position.set(L(${p0[0]}, ${p1[0]}), L(${p0[1]}, ${p1[1]}), L(${p0[2]}, ${p1[2]})); c.lookAt(L(${l0[0]}, ${l1[0]}), L(${l0[1]}, ${l1[1]}), L(${l0[2]}, ${l1[2]}));
   c.fov = L(${f0}, ${f1}); c.updateProjectionMatrix(); }`;
// a fight with nobody playing it (the Blob stands where it landed): for looking at the boss
const still3 = (b, name, frames, camera, extra = {}) => ({
  name,
  setup: `__tt.debugFight(0, ${b})`,
  until: "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control",
  atStart: camera,
  warm: 10,
  frames,
  ...extra,
});
// the forest, walked: the Blob goes calmly into a place (no running, no pulse), the camera with it
const walk = (id, name, x, y, jx, jy, frames = 120, pulseAt = -1, dt) => ({
  name,
  setup: `${begin} __tt.act1.warp('${id}')`,
  until: '__tt.act1.mode === "play"',
  atStart: `__tt.act1.trailerAt(${x}, ${y}, true); window.__f = 0`,
  warm: 6,
  each: `const i = __tt.input; i.joyX = ${jx}; i.joyY = ${jy}; if (window.__f++ === ${pulseAt}) { i.keys.add(' '); setTimeout(() => i.keys.delete(' '), 60); }`,
  frames,
  ...(dt ? { dt } : {}),
});

// sharper 3D for the Remotion cut: 720x1280 within a matching pixel budget
const HI = { viewport: [720, 1280], budget: 9.3e5 };
// a guardian fight in the forest, played by the bot from the moment the guardian is up (the action, not the entrance)
const fight2d = (id) => ({
  name: `f-${id}`,
  setup: `${begin} __bot.run('${id}', 1)`,
  until: `(() => { const z = __tt.act1.zones.find((q) => q.guardian && q.guardian.state !== 'gone'); return z && z.guardian.state === 'fight' })()`,
  frames: 540,
});


// ---- the third batch of shorts: places and angles never filmed before ----
// a camera along a path: keys are [frame, [x, y, z], [look x, y, z], fov], joined by Catmull-Rom curves
const path = (keys) =>
  `window.__f = 0; const K = ${JSON.stringify(keys)};
   const cr = (a, b, c, d, u) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
   __tt.beforeDraw = () => { const f = window.__f++; let i = 0; while (i < K.length - 2 && f >= K[i + 1][0]) i++;
     const k0 = K[Math.max(0, i - 1)], k1 = K[i], k2 = K[i + 1], k3 = K[Math.min(K.length - 1, i + 2)];
     const u = Math.min(1, Math.max(0, (f - k1[0]) / (k2[0] - k1[0])));
     const v = (j, e) => cr(k0[j][e], k1[j][e], k2[j][e], k3[j][e], u);
     const c = __tt.act2.arena.camera; c.position.set(v(1, 0), v(1, 1), v(1, 2)); c.lookAt(v(2, 0), v(2, 1), v(2, 2));
     c.fov = k1[3] + (k2[3] - k1[3]) * u; c.updateProjectionMatrix(); }`;
// the Crater with X in it, but the Blob never hurt (a hit would make it blink); `calm` holds X in his entrance, so nothing attacks,
// and `hide` takes him out of the picture; `at` puts the Blob somewhere
const crater = (name, frames, camera, o = {}) => ({
  name,
  setup: '__tt.debugFight(0, 0)',
  until: "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control",
  atStart: `__tt.act2.hurt = () => {}; ${camera}`,
  each: [
    o.at ? `__tt.act2.pl.x = ${o.at[0]}; __tt.act2.pl.z = ${o.at[1]};` : '',
    o.calm ? "{ const b = __tt.act2.boss; b.state = 'intro'; b.st = 0; }" : '',
    o.hide ? '{ const r = __tt.act2.boss.flattenRoot(); if (r) r.visible = false; }' : '',
  ].join(' '),
  warm: o.warm ?? 30,
  frames,
  ...HI,
  ...(o.dt ? { dt: o.dt } : {}),
});
const lerpPath = (n, p0, p1, l0, l1, f0, f1 = f0) => path([[0, p0, l0, f0], [n, p1, l1, f1]]);

export const SHOTS = [
  // ---- the third batch of shorts: a wildlife film of the Crater, and one take through it ----
  // night falls: from the moon down into the Crater (X not there yet)
  crater('wild-moon', 105, lerpPath(105, [12, 7, 24], [11.5, 6.6, 23], [-10, 26, -40], [-10, 9, -40], 55), { calm: true, hide: true }),
  // the Moonwell, pushing in
  crater('wild-well', 105, lerpPath(105, [-12.0, 4.0, -1.0], [-13.2, 3.2, -2.2], [-18.6, 0.9, -5.5], [-18.6, 0.9, -5.5], 45, 42), { calm: true, hide: true }),
  // the Blob, glimpsed through the ferns
  crater('wild-peek', 90, lerpPath(90, [8.4, 0.75, 11.8], [7.2, 0.8, 10.9], [2, 0.8, 9], [0.4, 0.8, 8.4], 48, 44), { calm: true, hide: true, at: [0, 8] }),
  // its face, from the grass
  crater('wild-face', 120, lerpPath(120, [0.5, 0.25, 9.2], [0.35, 0.3, 9.6], [0, 1.0, 12], [0, 1.0, 12], 42, 38), { calm: true, hide: true }),
  // at the Moonwell, among the crystal flowers
  crater('wild-wellface', 90, lerpPath(90, [-14.0, 1.6, -6.4], [-14.4, 1.5, -5.8], [-15.4, 1.2, -2.4], [-15.4, 1.2, -2.4], 40, 37), { calm: true, hide: true, at: [-15.2, -2.6], warm: 40 }),
  // X, on a long lens, from behind the Blob
  crater('wild-tele', 105, lerpPath(105, [1.5, 1.0, 30], [1.2, 1.1, 27], [0, 9, -29], [0, 10, -29], 18, 17)),
  // his face, closer than you would want to be
  crater('wild-xface', 90, lerpPath(90, [-3, 6, 6], [-2.6, 6.3, 7], [0, 13.5, -29], [0, 13.5, -29], 14, 12.5)),
  // what he took: the cage, on a long lens
  crater('wild-cage', 90, lerpPath(90, [4, 6, 10], [4, 6, 10], [13, 23, -44], [13, 23, -44], 14, 11)),
  // his foot, from the side, a long way off, in slow motion
  crater('wild-stomp', 240, lerpPath(240, [22, 1.2, 14], [21, 1.3, 13.4], [0, 2.2, 12], [0, 2.4, 12], 22, 20), { dt: 1 / 60 }),
  // and the Blob fights back (the bot plays), on a long lens that follows it
  {
    ...boss3(0, 0, 'wild-fight', 150),
    ...HI,
    atStart: "__tt.act2.hurt = () => {}; __tt.beforeDraw = () => { const a = __tt.act2.arena, c = a.camera, p = a.player.position; c.position.set(p.x + 9, p.y + 1.6, p.z + 6); c.lookAt(p.x, p.y + 1.2, p.z - 3); c.fov = 26; c.updateProjectionMatrix(); }",
  },
  // lofi: the Blob asleep by the Moonwell, the moth on its head, the camera barely moving (it loops)
  crater('lofi', 240, lerpPath(240, [-11.0, 2.4, 1.8], [-11.1, 2.38, 1.7], [-17.0, 1.1, -4.8], [-17.0, 1.1, -4.8], 40, 39.6), { calm: true, hide: true, at: [-15.2, -2.6], warm: 120 }),
  // ONE TAKE: out of the ferns, round in front of the Blob and the moth, over the floor, up to the Moonwell and round it, up, and
  // into X's eyes
  crater(
    'oner',
    630,
    path([
      [0, [10.8, 0.7, 13.6], [4, 0.8, 9.5], 50],
      [75, [7.8, 0.8, 11.2], [1, 0.9, 8.6], 50],
      [150, [2.8, 1.3, 6.2], [0, 1.0, 8], 50],
      [225, [-3.0, 3.2, 5.6], [-14, 1.8, 0], 50],
      [300, [-11.5, 2.6, 1.5], [-18.6, 1.0, -5.5], 50],
      [375, [-13.0, 6.0, -12.5], [-18.6, 1.0, -5.5], 50],
      [450, [-9, 9.5, -13], [4, 18, -38], 50],
      [540, [-2.5, 11.5, -12], [0, 12.5, -29], 50],
      [630, [-0.4, 12.8, -18.5], [0, 13.3, -29], 44],
    ]),
    { at: [0, 8] },
  ),
  // ---- the Remotion cut (v4) ----
  ...['gloom', 'thicket', 'marsh', 'bones', 'meadow'].map(fight2d),
  // X's foot comes down beside the Blob, from the Blob's own height, in slow motion
  still3(0, 'h-x-slam', 120, cam(120, [0.6, 1.25, 18.6], [0.4, 1.6, 17.6], [0, 9.5, -29], [0, 11.5, -29], 54, 58), { ...HI, dt: 1 / 60, warm: 190 }),
  // his gaze: the beam, from low beside the Blob
  still3(0, 'h-x-gaze', 120, cam(120, [-3.2, 1.0, 17.5], [-2.4, 1.3, 15.5], [0, 11, -29], [0, 9, -10], 56), { ...HI, setup: '__tt.debugFight(2, 0)' }),
  // X falls, and his lock on the cage breaks (the game's own cameras)
  { name: 'h-x-death', setup: '__tt.debugFight(3, 0)', until: "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control", atStart: 'const b = __tt.act2.boss; b.hp = 1; b.iframes = 0; b.damage(1, 0, 12, -29)', warm: 4, frames: 330, ...HI },
  // ---- the cinematic cut (v3) ----
  walk('gloom', 'w-gloom', 330, 1330, -0.22, -0.42),
  walk('thicket', 'w-thicket', 300, 940, -0.18, -0.44),
  walk('marsh', 'w-marsh', 960, 990, -0.28, -0.38),
  walk('bones', 'w-bones', 1000, 1310, -0.08, -0.48),
  walk('meadow', 'w-meadow', 900, 1730, 0.28, -0.4),
  // one pulse, on purpose, in slow motion: the light pushes the dark back
  walk('gloom', 'w-pulse', 300, 1240, -0.1, -0.2, 150, 36, 1 / 60),
  // X, from behind the small Blob, looking up the length of him
  still3(0, 'c-x-hero', 120, cam(120, [0.9, 1.2, 19.5], [0.3, 2.6, 15.8], [0, 10.5, -29], [0, 13.2, -29], 50, 58)),
  // his foot, from the ground beside you, in slow motion
  still3(0, 'c-x-stomp', 210, cam(210, [7.5, 1.1, 18.5], [6.2, 1.4, 16.5], [0, 3.0, 4], [0, 4.0, 4], 52, 48), { dt: 1 / 60, warm: 30 }),
  // the cage, high over the arena, Mother and Father in it
  still3(0, 'c-cage', 100, cam(100, [2, 3.5, 2], [6, 9, -16], [13, 23, -44], [13, 23.5, -44], 46, 34)),
  // you fight back: behind the Blob as it fights X
  { ...boss3(0, 0, 'c-chase'), frames: 150, atStart: "window.__f = 0; __tt.beforeDraw = () => { const a = __tt.act2.arena, c = a.camera, p = a.player.position; c.position.set(p.x * 0.85 + 1.2, p.y + 2.3, p.z + 5.6); c.lookAt(p.x * 0.4, 7.5, -26); c.fov = 56; c.updateProjectionMatrix(); }" },
  still3(1, 'c-collector', 110, cam(110, [5.2, 2.2, 9.0], [3.0, 4.6, 4.6], [0, 11.0, -27], [0.4, 14.5, -27], 58)),
  still3(2, 'c-mash', 110, cam(110, [-9.5, 2.4, 8.0], [-5.5, 4.4, 3.4], [-1, 8.0, -24], [1, 10.5, -24], 58)),

  // the forest: three small lights, curled up; Mother and Father
  { name: 'opening', setup: '__tt.begin()', until: "__tt.act1.mode === 'opening'", frames: 420 },
  // the forest, running (the guardian zones, by warp, the Blob walking on)
  ...['gloom', 'thicket', 'marsh', 'bones', 'meadow'].map((id) => ({
    name: `z-${id}`,
    setup: `${begin} __tt.act1.warp('${id}')`,
    until: '__tt.act1.mode === "play"',
    warm: 10,
    each: "const i = __tt.input; const t = __tt.act1.time; i.joyX = Math.sin(t * 0.7) * 0.8; i.joyY = -0.6 + Math.cos(t * 0.5) * 0.3; if (Math.floor(t * 1.4) !== Math.floor((t - 1/30) * 1.4)) { i.keys.add(' '); setTimeout(() => i.keys.delete(' '), 40); }",
    frames: 120,
  })),
  // the five guardians: their entrances and the first of each fight
  ...['gloom', 'thicket', 'marsh', 'bones', 'meadow'].map(guardian),
  // the Edge: X comes into the forest, the portal, the dive, the boom, and the fall into the Crater
  { name: 'edge', setup: '__tt.playEdge()', until: "__tt.act1.mode !== 'opening'", budget: 6.5e5, frames: 2400, stop: "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight'" },
  // the 3D bosses
  boss3(0, 0, 'x-foot'),
  boss3(0, 1, 'x-rake'),
  boss3(0, 2, 'x-gaze'),
  boss3(0, 3, 'x-jaws'),
  boss3(1, 0, 'collector-0'),
  boss3(1, 2, 'collector-2'),
  boss3(2, 0, 'mash-0'),
  boss3(2, 2, 'mash-2'),
  boss3(2, 3, 'mash-3'),
  // the ending: the last lock, the cage, the family
  { name: 'reunion', setup: '__tt.playEnding()', until: '!!__tt.act2.cut', frames: 430 },
  // the three of them under the moon, after: the opening seconds of what comes next, and no more (the trailer keeps it a secret)
  { name: 'moonlit', setup: '__tt.playFourth()', until: '!!__tt.act2.cut && __tt.act2.cut.len > 30', atStart: '__tt.act2.cut.t = 1.4', frames: 66 },
];
