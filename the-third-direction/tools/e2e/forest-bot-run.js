(async () => {
  // the bot plays one forest guardian at 3x speed (set window.__id first); prints how the fight went
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const id = window.__id;
  const t0 = performance.now();
  __bot.run(id, 3);
  let rep = __bot.report();
  while (performance.now() - t0 < 60000 && rep.state !== 'fight') {
    await sleep(300);
    rep = __bot.report();
  }
  const t1 = performance.now();
  let minHearts = rep.hearts;
  while (performance.now() - t1 < 240000) {
    await sleep(400);
    rep = __bot.report();
    minHearts = Math.min(minHearts, rep.hearts);
    if (rep.state === 'dying' || rep.state === 'gone' || rep.state === 'dead' || rep.deaths >= 8) break;
  }
  return { id, diff: document.querySelector('.dtile.on b')?.textContent, guardian: rep.guardian, state: rep.state, deaths: rep.deaths, minHearts, dashes: rep.dashes, lances: rep.lances, pulses: rep.pulses, wall: Math.round((performance.now() - t1) / 1000) };
})()
