(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = __tt, a = g.act2;
  // (no graphics card here: the Crater's plants and forest are hidden, the fight is the same)
  a.arena.crater.setLite(true);
  const out = { diff: document.querySelector('.dtile.on b')?.textContent, bosses: [] };
  const log = [];
  let lastBi = -1, lastName = '', t0 = performance.now(), lastHearts = null, lost = 0;
  __bot3.run(0, 0, 3);
  const dead0 = g.stats.deaths;
  const iv = setInterval(() => {
    if (lastHearts !== null && a.hearts < lastHearts) lost += lastHearts - a.hearts;
    lastHearts = a.hearts;
    if (a.bi !== lastBi || (a.state === 'fight' && a.boss?.name !== lastName)) {
      log.push({ bi: a.bi, name: a.boss?.name, wall: Math.round((performance.now() - t0) / 1000), deaths: g.stats.deaths - dead0 });
      lastBi = a.bi;
      lastName = a.boss?.name;
    }
  }, 20);
  const t1 = performance.now();
  // the three, the ending, the Fourth coming: until the Blob wakes in the dimension and can move
  while (performance.now() - t1 < 1500000 && a.state !== 'end' && !(a.state === 'dimension' && a.control)) await sleep(250);
  out.dimension = a.state === 'dimension';
  if (out.dimension) {
    // walk it to the gate
    __bot3.route(3);
    while (performance.now() - t1 < 2400000 && a.state !== 'end') await sleep(250);
    out.route = __bot3.routeReport();
  }
  clearInterval(iv);
  out.ended = a.state === 'end';
  out.endLine = a.endLine;
  out.log = log; out.heartsLost = lost; out.deaths = g.stats.deaths - dead0;
  out.wall = Math.round((performance.now() - t0) / 1000);
  out.rep = __bot3.report();
  return out;
})()
