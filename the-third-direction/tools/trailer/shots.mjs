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

export const SHOTS = [
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
