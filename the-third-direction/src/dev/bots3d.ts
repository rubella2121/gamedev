import type { Game } from '../game';
import { groundY as groundAt } from '../act2/ground';

/**
 * A playing bot for the 3D bosses (test builds only). It plays through the real game: the joystick for movement, the
 * action button's real code paths for a strike, a lance, a nova and a dash. It reads what is about to hurt from the
 * boss (`dangers()`) and what can be hit from `weak()`, so it works on every boss without a brain of its own.
 *
 *   __bot3.run(bossIndex, phase, speed)    go into that boss's fight at that phase and play it
 *   __bot3.report()                        what is happening
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const SPEED = 7.6;
const TAU = Math.PI * 2;

export function installBots3d(game: Game) {
  const g0 = game as unknown as Any;
  const a2: Any = g0.act2;
  const input: Any = g0.input;
  let on = false;
  let started = 0;
  let lastAct = -9;
  const stats = { strikes: 0, lances: 0, novas: 0, dashes: 0, deaths0: 0, hits: 0 };

  function setMove(wx: number, wz: number) {
    // world direction to the joystick: movement is relative to the camera
    const f = a2.camFwd();
    const rx = -f.z;
    const rz = f.x;
    const jx = wx * rx + wz * rz;
    const jy = -(wx * f.x + wz * f.z);
    input.joyX = jx;
    input.joyY = jy;
  }

  function hits(d: Any, x: number, z: number, t: number): boolean {
    if (t < d.at - 0.05 || t > d.at + d.dur + 0.12) return false;
    if (d.shape === 'disc') return Math.hypot(x - d.x, z - d.z) < d.r + 0.55;
    if (d.shape === 'ring') {
      const r = Math.hypot(x - d.x, z - d.z);
      return r > d.r - (d.w ?? 1) - 0.4 && r < d.r + 0.4;
    }
    // oriented box: centre (x, z), direction ang (0 = +z), length len, half width
    if (d.shape === 'lane' || d.shape === 'box') {
      const dx = Math.sin(d.ang);
      const dz = Math.cos(d.ang);
      const rx = x - d.x;
      const rz = z - d.z;
      const along = rx * dx + rz * dz;
      const perp = Math.abs(rx * dz - rz * dx);
      return Math.abs(along) <= d.len / 2 && perp < d.half + 0.55;
    }
    if (d.shape === 'cone') {
      // a beam from its origin
      const dx = Math.sin(d.ang);
      const dz = Math.cos(d.ang);
      const rx = x - d.x;
      const rz = z - d.z;
      const along = rx * dx + rz * dz;
      const perp = Math.abs(rx * dz - rz * dx);
      return along > 0 && along < d.len && perp < d.half + 0.55;
    }
    return false;
  }

  function cost(dangers: Any[], px: number, pz: number, dx: number, dz: number, solids: Any[]): number {
    let c = 0;
    for (const t of [0.12, 0.25, 0.4, 0.6, 0.85, 1.1, 1.4]) {
      const m = Math.min(t, 0.9);
      const x = px + dx * SPEED * m;
      const z = pz + dz * SPEED * m;
      if (Math.hypot(x, z) > 17.4) c += 3;
      for (const s of solids) if (s.alive && Math.hypot(x - s.x, z - s.z) < s.r + 0.6) c += 2;
      for (const d of dangers) if (hits(d, x, z, t)) c += t < 0.5 ? 10 : 5;
    }
    return c;
  }

  function tick() {
    if (!on) return;
    const boss = a2.boss;
    const pl = a2.pl;
    if (a2.state !== 'fight' || boss.state !== 'fight' || pl.dead || !a2.control) {
      input.joyX = input.joyY = 0;
      return;
    }
    const dangers: Any[] = boss.dangers();
    // the guard of a fallen heart, too
    a2.features.dangers(dangers);
    const weak: Any[] = boss.weak();
    const solids: Any[] = a2.solids;
    // where to go: the nearest thing that can be hit, standing a little inside its reach
    let goal: [number, number] | null = null;
    let target: Any = null;
    let bd = 1e9;
    for (const w of weak) {
      const d = Math.hypot(w.x - pl.x, w.z - pl.z);
      if (d < bd) {
        bd = d;
        target = w;
      }
    }
    if (target) {
      const l = bd || 1;
      const stand = Math.max(0.8, target.reach * 0.55);
      goal = [target.x - ((target.x - pl.x) / l) * stand, target.z - ((target.z - pl.z) / l) * stand];
    } else {
      // nothing to hit: wait in the open, near the middle, away from the boss
      goal = [pl.x * 0.9, Math.max(pl.z, 4)];
      if (Math.hypot(pl.x, pl.z - 4) < 3) goal = [pl.x, pl.z];
    }
    // light and wells
    // (the Moonwell is far, up on a terrace, and slow: the trip is only worth it on the last heart)
    const lowHearts = a2.hearts <= 1 && a2.hearts < a2.maxHearts;
    if (!target && lowHearts) {
      let bw: Any = null;
      let bwd = 1e9;
      for (const w of a2.features.wells) {
        if (w.ready < 1) continue;
        const d = Math.hypot(w.x - pl.x, w.z - pl.z);
        if (d < bwd) {
          bwd = d;
          bw = w;
        }
      }
      if (bw && bwd < 22) goal = [bw.x, bw.z];
      // the Moonwell is up on the west terrace: from the floor, go round by the stone ramp
      if (bw && a2.arena.crater && groundAt(bw.x, bw.z) > 0.4 && groundAt(pl.x, pl.z) < 0.4) goal = pl.x > -9.2 ? [-8.6, 2.1] : [-15.6, 2.1];
    }
    const dirs: [number, number][] = [[0, 0]];
    for (let i = 0; i < 12; i++) dirs.push([Math.sin((i / 12) * TAU), Math.cos((i / 12) * TAU)]);
    let best: [number, number] = [0, 0];
    let bestC = 1e9;
    let hereC = 0;
    let bestRisk = 0;
    for (const [dx, dz] of dirs) {
      // a cliff would stop it dead: that is not a way to go
      if ((dx || dz) && !a2.canStep(pl.x, pl.z, dx * 0.5, dz * 0.5)) continue;
      const risk = cost(dangers, pl.x, pl.z, dx, dz, solids);
      if (!dx && !dz) hereC = risk;
      const px = pl.x + dx * SPEED * 0.45;
      const pz = pl.z + dz * SPEED * 0.45;
      let c = risk * 6 + Math.hypot(goal[0] - px, goal[1] - pz);
      if (!dx && !dz) c += 0.6;
      if (c < bestC) {
        bestC = c;
        best = [dx, dz];
        bestRisk = risk;
      }
    }
    if (!hereC && Math.hypot(goal[0] - pl.x, goal[1] - pl.z) < 0.6) best = [0, 0];
    setMove(best[0], best[1]);
    const now = performance.now() / 1000;
    // a ring coming outwards and about to reach us: dash in through it (the dash cannot be hurt)
    const ring = dangers.find((d) => d.shape === 'ring' && d.at < 0.15 && Math.hypot(pl.x - d.x, pl.z - d.z) > d.r - (d.w ?? 1) - 0.6 && Math.hypot(pl.x - d.x, pl.z - d.z) < d.r + 0.9);
    if (ring && a2.dashCd <= 0 && a2.dashT <= 0 && a2.dashPool.can()) {
      const dl = Math.hypot(ring.x - pl.x, ring.z - pl.z) || 1;
      a2.yaw = Math.atan2((ring.x - pl.x) / dl, (ring.z - pl.z) / dl);
      setMove((ring.x - pl.x) / dl, (ring.z - pl.z) / dl);
      a2.startDash();
      stats.dashes++;
    } else if (hereC >= 10 && bestRisk >= 10 && a2.dashCd <= 0 && a2.dashT <= 0 && a2.dashPool.can()) {
      // cornered: dash
      a2.startDash();
      stats.dashes++;
    }
    // hit what can be hit
    if (target && now - lastAct > 0.5 && a2.strikeCd <= 0) {
      const d = Math.hypot(target.x - pl.x, target.z - pl.z);
      if (d <= target.reach + 3.5) {
        a2.strikeCd = 0;
        input.keys.add(' ');
        setTimeout(() => input.keys.delete(' '), 90);
        lastAct = now;
        stats.strikes++;
      } else if (d < 26) {
        a2.yaw = Math.atan2(target.x - pl.x, target.z - pl.z);
        a2.castLance();
        lastAct = now;
        stats.lances++;
      }
    }
    // a full meter goes into a nova when the floor gets crowded
    if (a2.light >= 3 && dangers.filter((d) => d.at < 0.6).length > 3) {
      a2.castNova();
      stats.novas++;
    }
  }

  setInterval(tick, 33);

  (window as unknown as { __bot3: unknown }).__bot3 = {
    run(boss = 0, phase = 0, speed = 1) {
      on = true;
      started = performance.now();
      g0.debugSpeed = speed;
      g0.debugRenderEvery = speed > 1 ? 6 : 1;
      stats.strikes = stats.lances = stats.novas = stats.dashes = 0;
      stats.deaths0 = g0.stats.deaths;
      g0.debugFight(phase, boss);
      return 'running';
    },
    stop() {
      on = false;
      input.joyX = input.joyY = 0;
      g0.debugSpeed = 1;
      g0.debugRenderEvery = 1;
    },
    report() {
      const b = a2.boss;
      return {
        st: a2.state,
        bi: a2.bi,
        boss: b.name,
        bs: b.state,
        phase: b.phase,
        hp: b.hp,
        maxHp: b.maxHp,
        hearts: a2.hearts,
        light: Math.round(a2.light * 10) / 10,
        deaths: g0.stats.deaths - stats.deaths0,
        seconds: Math.round((performance.now() - started) / 100) / 10,
        game: Math.round(b.t * 10) / 10,
        fps: g0.fps,
        fst: b.fst ?? null,
        ...stats,
      };
    },
  };
}
