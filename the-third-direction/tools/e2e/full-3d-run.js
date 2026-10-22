(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = __tt, a = g.act2;
  const out = { diff: document.querySelector('.dtile.on b')?.textContent, bosses: [] };
  const log = [];
  let lastBi = -1, t0 = performance.now(), lastHearts = null, lost = 0;
  __bot3.run(0, 0, 3);
  const dead0 = g.stats.deaths;
  const iv = setInterval(() => {
    if (lastHearts !== null && a.hearts < lastHearts) lost += lastHearts - a.hearts;
    lastHearts = a.hearts;
    if (a.bi !== lastBi) { log.push({ bi: a.bi, name: a.boss?.name, wall: Math.round((performance.now() - t0) / 1000), deaths: g.stats.deaths - dead0 }); lastBi = a.bi; }
  }, 20);
  const t1 = performance.now();
  while (performance.now() - t1 < 1500000 && a.state !== 'end') await sleep(250);
  clearInterval(iv);
  out.ended = a.state === 'end';
  out.log = log; out.heartsLost = lost; out.deaths = g.stats.deaths - dead0;
  out.wall = Math.round((performance.now() - t0) / 1000);
  out.rep = __bot3.report();
  return out;
})()
