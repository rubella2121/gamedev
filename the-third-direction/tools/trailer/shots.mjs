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

export const SHOTS = [
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
  // the Fourth comes, and takes all three of them (the scene in pieces: the clock jumps to each)
  ...[
    ['t-unfold', 1.4, 150],
    ['t-eye', 6.45, 120],
    ['t-family', 10.45, 75],
    ['t-lift', 15.2, 135],
    ['t-dial', 20.7, 130],
    ['t-descend', 28.25, 160],
  ].map(([name, at, frames]) => ({ name, setup: '__tt.playFourth()', until: '!!__tt.act2.cut && __tt.act2.cut.len > 30', atStart: `__tt.act2.cut.t = ${at}`, frames })),
  // the fight beside Mother and Father
  { name: 'fourth-fight', setup: "__tt.playFourth(); window.__sk = setInterval(() => { const a = __tt.act2; if (a.cut) { a.cut.skip(); a.endCut(true); } }, 200)", until: "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control", atStart: 'clearInterval(window.__sk); __bot3.attach(1)', warm: 20, frames: 240 },
  // it runs: "I will come back."
  { name: 'flee', setup: "__tt.playFourth(); window.__sk = setInterval(() => { const a = __tt.act2; if (a.cut) { a.cut.skip(); a.endCut(true); } }, 200)", until: "__tt.act2.state === 'fight' && __tt.act2.boss.state === 'fight' && __tt.act2.control", atStart: 'clearInterval(window.__sk); __tt.act2.boss.hide(); __tt.act2.boss.show(); __tt.act2.fourthFled()', frames: 560 },
];
