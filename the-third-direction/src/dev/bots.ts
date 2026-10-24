import type { Game } from '../game';

/**
 * Playing bots for the guardian fights (test builds only: see __BOTS__ in the vite configs).
 *
 * A bot is two things. A steering layer that every fight shares: it looks a fraction of a second ahead at every hazard
 * and bullet the guardian has out and picks the move that keeps it safe while it walks to a goal. And a small "brain"
 * per guardian that says where to stand and when to pulse, throw a Lance or dash. They play the real fight through the
 * real game: movement through the arrow keys, attacks through the same functions the button calls.
 *
 *   __bot.run('gloom')      go into that arena and play it
 *   __bot.report()          what is happening
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Brain = { goal: [number, number]; stand?: boolean };

const SPEED = 66;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function installBots(game: Game) {
  const g0 = game as unknown as Any;
  const f: Any = g0.act1;
  const input: Any = g0.input;
  const P: Any = () => f.player;
  let on = false;
  let lastLance = -9;
  let started = 0;
  const stats = { pulses: 0, lances: 0, dashes: 0, novas: 0, deaths0: 0 };

  function setKeys(dx: number, dy: number) {
    const keys: Set<string> = input.keys;
    for (const k of ['arrowup', 'arrowdown', 'arrowleft', 'arrowright']) keys.delete(k);
    if (dx > 0.3) keys.add('arrowright');
    else if (dx < -0.3) keys.add('arrowleft');
    if (dy > 0.3) keys.add('arrowdown');
    else if (dy < -0.3) keys.add('arrowup');
  }

  function active(): { z: Any; g: Any } | null {
    for (const z of f.zones) if (z.guardian && z.guardian.state !== 'gone') return { z, g: z.guardian };
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* danger: what would hurt at (x, y) in `ahead` seconds              */
  /* ---------------------------------------------------------------- */

  function extraDanger(g: Any, x: number, y: number, ahead: number): number {
    let d = 0;
    const name: string = g.name;
    if (name === 'Thornback King') {
      // a crawling root's head (its thorns are hazards, and are seen like any other), and the spinning ball
      for (const r of g.runners) {
        const bx = r.x + Math.cos(r.ang) * 52 * ahead;
        const by = r.y + Math.sin(r.ang) * 42 * ahead;
        if (Math.hypot(x - bx, y - by) < 16) d += 8;
      }
      if (g.mode === 'spin' && Math.hypot(x - g.x, (y - g.y) / 0.8) < 60) d += 12;
    } else if (name === 'Toll Queen') {
      if (g.mode === 'dive') {
        const bx = g.qx + g.dive.dx * 290 * ahead;
        const by = g.qy + g.dive.dy * 290 * ahead;
        if (Math.abs(x - bx) < 36 && Math.abs(y - by) < 16) d += 12;
      }
    } else if (name === 'Mimic Queen') {
      for (const b of g.blooms) if (b.st !== 'pop' && Math.abs(x - b.x) < 25 && Math.abs(y - b.y) < 18) d += 5;
    } else if (name === 'Gloommother') {
      for (const m of g.min) if (m.mode !== 'dying' && Math.hypot(x - m.x, y - m.y) < 9) d += 2;
    }
    return d;
  }

  /**
   * What walking in direction (dx, dy) would cost. Every hazard is asked "would you hurt me there?" at the moments it can
   * hurt (it is advanced in time to ask), so a ring that is still far away is dodged by walking to its gap now.
   */
  function pathCost(g: Any, p: Any, dx: number, dy: number): number {
    let d = 0;
    const at = (t: number): [number, number] => {
      const m = Math.min(t, 0.7);
      return [p.x + dx * SPEED * m, p.y + dy * SPEED * m];
    };
    for (const h of g.hz.list) {
      if (h.hit || !(h.dmg > 0 || h.tag === 'lane')) continue;
      const end = h.warn + h.live;
      if (h.t > end + 0.05) continue;
      const save = h.t;
      for (let t = 0.1; t <= 1.5; t += 0.1) {
        const ht = save + t;
        if (ht < h.warn || ht > end) continue;
        const [x, y] = at(t);
        h.t = ht;
        const hit = g.hz.touches(h, x, y);
        h.t = save;
        if (hit) d += t < 0.5 ? 10 : 5;
        // a sweeping line moves: be generous
        if (h.tag === 'sweep' && Math.abs(y - h.y) < 22 + 80 * Math.max(t, 0.2) && x > h.x - 3 && x < h.x + h.len + 3) d += 6;
      }
      h.t = save;
    }
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
      const [x, y] = at(t);
      for (const s of g.shots.list) {
        if (s.dmg <= 0) continue;
        const sx = s.x + s.vx * t;
        const sy = s.y + s.vy * t;
        if (Math.hypot(x - sx, (y - 5 - sy) / 0.9) < s.r + 8) d += 8;
      }
      d += extraDanger(g, x, y, t);
    }
    return d;
  }

  /** Pick the move that gets closest to the goal without walking into anything that is about to hurt. */
  function steer(g: Any, goal: [number, number], stand: boolean) {
    const p = P();
    if (p.dead > 0 || f.freezeT > 0 || f.trans) {
      setKeys(0, 0);
      return;
    }
    const dirs: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]];
    let best: [number, number] = [0, 0];
    let bestC = 1e9;
    let bestRisk = 0;
    let hereC = 0;
    for (const [dx, dy] of dirs) {
      let blocked = false;
      for (const t of [0.12, 0.25, 0.4]) {
        if ((dx || dy) && !f.canStand(p.x + dx * SPEED * t, p.y + dy * SPEED * t)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const risk = pathCost(g, p, dx, dy);
      if (!dx && !dy) hereC = risk;
      const px = p.x + dx * SPEED * 0.4;
      const py = p.y + dy * SPEED * 0.4;
      let cost = risk * 30 + Math.hypot(goal[0] - px, (goal[1] - py) / 0.9);
      if (!dx && !dy) cost += stand ? -2 : 2.5;
      if (cost < bestC) {
        bestC = cost;
        best = [dx, dy];
        bestRisk = risk;
      }
    }
    // already near the goal and nothing is coming: stand still
    if (!hereC && Math.hypot(goal[0] - p.x, goal[1] - p.y) < 4) best = [0, 0];
    setKeys(best[0], best[1]);
    // cornered: a dash has invulnerability frames
    if (hereC >= 10 && bestRisk >= 10 && (best[0] || best[1])) dash();
  }

  /* ---------------------------------------------------------------- */
  /* actions                                                           */
  /* ---------------------------------------------------------------- */

  function pulse() {
    const p = P();
    if (p.pulseCd <= 0 && p.dashT <= 0 && p.dead <= 0 && f.freezeT <= 0) {
      f.castPulse();
      stats.pulses++;
    }
  }

  function lanceAt(tx: number, ty: number) {
    const p = P();
    const now = performance.now() / 1000;
    if (p.pulseCd > 0 || now - lastLance < 0.6 || p.dead > 0 || f.freezeT > 0) return;
    const dx = tx - p.x;
    const dy = ty - (p.y - 8);
    const l = Math.hypot(dx, dy) || 1;
    f.aim = { x: dx / l, y: dy / l };
    f.castLance();
    lastLance = now;
    stats.lances++;
  }

  function dash() {
    const p = P();
    if (p.dashCd <= 0 && f.dashPool.can() && p.dead <= 0 && f.freezeT <= 0) {
      f.dash();
      stats.dashes++;
    }
  }

  function nova() {
    const p = P();
    if (p.light >= 3 && p.dead <= 0 && f.freezeT <= 0) {
      f.castNova();
      stats.novas++;
    }
  }

  /* ---------------------------------------------------------------- */
  /* the brains                                                        */
  /* ---------------------------------------------------------------- */

  function brainMother(g: Any): Brain {
    const A = f.arena;
    const p = P();
    const cx = A.x;
    const mins = g.min.filter((m: Any) => m.mode !== 'dying');
    const core = { x: g.bx, y: g.by - 32 };
    const dCore = Math.hypot(p.x - core.x, (p.y - core.y) / 0.8);
    if (g.phase === 0) {
      if (g.mode === 'shield') {
        let t: Any = null;
        let bd = 1e9;
        for (const m of mins) {
          const d = Math.hypot(m.x - p.x, m.y - p.y);
          if (d < bd) {
            bd = d;
            t = m;
          }
        }
        if (t) {
          if (bd < 30) pulse();
          return { goal: [t.x, t.y + 6] };
        }
        return { goal: [cx, g.by + 90] };
      }
      if (g.mode === 'exposed') {
        if (dCore <= 54) pulse();
        return { goal: [g.bx, g.by + 8] };
      }
      return { goal: [cx, g.by + 100] };
    }
    if (g.phase === 1) {
      if (g.mode === 'chase' || g.mode === 'sink') {
        for (const s of g.shots.list) if (s.pulsable && Math.hypot(s.x - p.x, s.y - p.y) < 20) pulse();
        const sh = g.shadow;
        const ax = p.x - sh.x;
        const ay = p.y - sh.y;
        const l = Math.hypot(ax, ay) || 1;
        return { goal: [clamp(p.x + (ax / l) * 70, A.x - 90, A.x + 90), clamp(p.y + (ay / l) * 70, A.y + 20, A.y + 170)] };
      }
      if (g.mode === 'lock') return { goal: [p.x, p.y] };
      if (g.mode === 'up') {
        const lines = g.hz.list.filter((h: Any) => h.kind === 'line' && h.dmg > 0);
        let ang = Math.PI / 2;
        if (lines.length) {
          const angs: number[] = lines.map((h: Any) => ((h.ang % TAU) + TAU) % TAU).sort((a: number, b: number) => a - b);
          let bestS = -1e9;
          for (let i = 0; i < angs.length; i++) {
            const a0 = angs[i]!;
            const a1 = angs[(i + 1) % angs.length]! + (i === angs.length - 1 ? TAU : 0);
            const mid = (a0 + a1) / 2;
            const score = a1 - a0 + Math.sin(mid) * 0.5;
            if (score > bestS) {
              bestS = score;
              ang = mid;
            }
          }
        }
        if (g.exposed > 0.6 && dCore <= 54) pulse();
        return { goal: [g.bx + Math.cos(ang) * 36, g.by - 6 + Math.sin(ang) * 26] };
      }
      return { goal: [cx, A.y + 100] };
    }
    // phase 3: the eclipse
    for (const m of mins) if (Math.hypot(m.x - p.x, m.y - p.y) < 22) pulse();
    const lit = g.lamps.t.filter((v: number) => v > 0).length;
    if (lit < 2) {
      let best = -1;
      let bd = 1e9;
      g.lamps.items.forEach((l: Any, i: number) => {
        if (g.lamps.t[i] > 4) return;
        const d = Math.hypot(l.x - p.x, l.y - p.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) {
        const l = g.lamps.items[best];
        if (bd < 34) pulse();
        return { goal: [l.x, l.y + 14] };
      }
    }
    if (g.exposed > 0.6) {
      const d = Math.hypot(core.x - p.x, core.y - (p.y - 8));
      if (d < 240) lanceAt(core.x, core.y);
      else return { goal: [p.x, p.y - 40] };
    }
    return { goal: [p.x, p.y], stand: true };
  }

  function brainKing(g: Any): Brain {
    const A = f.arena;
    const p = P();
    // his back is open: get beside him and pulse
    if (g.mode === 'open') {
      const w = g.weak();
      const d = Math.hypot(p.x - g.x, (p.y - (g.y - 12)) / 0.8);
      if (d <= 36 + 34 - 6) pulse();
      else if (Math.hypot(p.x - w.x, p.y - w.y) < 200 && Math.hypot(p.x - g.x, p.y - g.y) > 90) lanceAt(w.x, w.y);
      return { goal: [g.x + (p.x > g.x ? 46 : -46), g.y + 6] };
    }
    // the wheel: stand well off
    if (g.mode === 'spin' || (g.mode === 'windup' && g.attack === 'wheel')) {
      const ax = p.x - g.x;
      const ay = p.y - g.y;
      const l = Math.hypot(ax, ay) || 1;
      return { goal: [clamp(g.x + (ax / l) * 120, A.x - 150, A.x + 150), clamp(g.y + (ay / l) * 90, A.y - 60, A.y + 150)] };
    }
    // otherwise keep a little way off, near him, ready to step in
    const ax = p.x - g.x;
    const ay = p.y - g.y;
    const l = Math.hypot(ax, ay) || 1;
    if (g.runners.length) return { goal: [p.x, p.y] };
    return { goal: [clamp(g.x + (ax / l) * 80, A.x - 150, A.x + 150), clamp(g.y + (ay / l) * 60, A.y - 60, A.y + 150)] };
  }

  function brainQueen(g: Any): Brain {
    const A = f.arena;
    const p = P();
    const eye = { x: g.qx, y: g.qy - g.hover - 88 };
    if (g.mode === 'watch') {
      if (g.open > 0.7 && !g.hitDone) {
        const d = Math.hypot(eye.x - p.x, eye.y - (p.y - 8));
        if (d < 245) lanceAt(eye.x, eye.y);
        else return { goal: [p.x, p.y - 30] };
      }
      return { goal: [p.x, p.y], stand: true };
    }
    if (g.mode === 'toll' || g.mode === 'stagger' || g.mode === 'rise') return { goal: [clamp(g.qx, A.x - 50, A.x + 50), g.qy + 96] };
    if (g.mode === 'crash' && !g.hitDone) {
      const d = Math.hypot(p.x - g.qx, (p.y - g.qy) / 0.8);
      if (d <= 36 + 30 - 8) pulse();
      return { goal: [g.qx, g.qy + 18] };
    }
    if (g.mode === 'warn' || g.mode === 'dive') return { goal: [p.x, p.y] };
    return { goal: [p.x, p.y], stand: true };
  }

  function brainWyrm(g: Any): Brain {
    const A = f.arena;
    const p = P();
    if (g.mode === 'up' && !g.hitDone && g.hRise > 0.6) {
      const d = Math.hypot(p.x - g.hx, (p.y - g.hy) / 0.8);
      if (d <= 36 + 24 - 6) pulse();
      return { goal: [g.hx + (p.x > g.hx ? 20 : -20), g.hy + 18] };
    }
    if (g.mode === 'hunt' || g.mode === 'lock' || g.mode === 'sink' || g.mode === 'roar' || g.mode === 'up') {
      const ax = p.x - g.hx;
      const ay = p.y - g.hy;
      const l = Math.hypot(ax, ay) || 1;
      if (l < 130) return { goal: [clamp(p.x + (ax / l) * 60, A.x - 90, A.x + 90), clamp(p.y + (ay / l) * 60, A.y - 20, A.y + 170)] };
    }
    return { goal: [p.x, p.y], stand: true };
  }

  function brainMimic(g: Any): Brain {
    const A = f.arena;
    const p = P();
    const m = { x: g.qx, y: g.qy - 66 };
    for (const b of g.blooms) if (b.st === 'idle' && Math.hypot(b.x - p.x, b.y - p.y) < 26) pulse();
    for (const s of g.shots.list) if (s.pulsable && Math.hypot(s.x - p.x, s.y - p.y) < 18) pulse();
    if (g.pulling) {
      const ax = p.x - m.x;
      const ay = p.y - (m.y + 50);
      const l = Math.hypot(ax, ay) || 1;
      if (l < 70) dash();
      return { goal: [p.x + (ax / l) * 60, Math.min(A.y + 190, p.y + (ay / l) * 60)] };
    }
    if (g.exposed && !g.hitDone) {
      const L = g.lure;
      const d = Math.hypot(p.x - L.x, (p.y - L.y) / 0.8);
      if (d <= 44) pulse();
      else if (d > 80) lanceAt(L.x, L.y);
      return { goal: [L.x + 2, L.y + 22] };
    }
    return { goal: [A.x, A.y + 120] };
  }

  const brains: Record<string, (g: Any) => Brain> = {
    Gloommother: brainMother,
    'Thornback King': brainKing,
    'Toll Queen': brainQueen,
    'Bone Wyrm': brainWyrm,
    'Mimic Queen': brainMimic,
  };

  function tick() {
    if (!on) return;
    const a = active();
    if (!a) {
      setKeys(0, 0);
      return;
    }
    const g = a.g;
    if (g.state !== 'fight') {
      setKeys(0, 0);
      return;
    }
    const brain = brains[g.name];
    if (!brain) return;
    const b = brain(g);
    // a full light meter is spent on a Nova when things get hairy
    if (P().light >= 3 && g.hz.list.filter((h: Any) => h.dmg > 0).length > 3) nova();
    steer(g, b.goal, !!b.stand);
  }

  setInterval(tick, 33);

  const bot = {
    /** go into a guardian's arena and play it */
    run(id: string, speed = 1) {
      on = true;
      started = performance.now();
      g0.debugSpeed = speed;
      stats.pulses = stats.lances = stats.dashes = stats.novas = 0;
      stats.deaths0 = g0.stats.deaths;
      f.debugArena(id);
      return 'running ' + id;
    },
    stop() {
      on = false;
      setKeys(0, 0);
      g0.debugSpeed = 1;
    },
    report() {
      const a = active();
      const g = a?.g;
      return {
        arena: !!f.arena,
        guardian: g ? g.name : null,
        state: g ? g.state : 'none',
        phase: g ? g.phase : -1,
        hp: g ? g.hp : -1,
        maxHp: g ? g.maxHp : -1,
        mode: g ? g.mode ?? null : null,
        hearts: P().hearts,
        deaths: g0.stats.deaths - stats.deaths0,
        seconds: Math.round((performance.now() - started) / 100) / 10,
        cleared: f.zones.map((z: Any) => z.cleared),
        ...stats,
      };
    },
  };
  (window as unknown as { __bot: unknown }).__bot = bot;
}
