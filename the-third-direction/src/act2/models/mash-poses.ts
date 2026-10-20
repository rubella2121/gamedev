import * as THREE from 'three';
import { TAIL_BASE } from './mash-layout';
import { mixCtrl, newCtrl, STING_LEN, TAIL_L_IDLE, TAIL_LMAX, VIA_N, type TailCtrl } from './mash-tail';

/**
 * The tail's poses, as controls for `ScorpionTail`: idle curl, rear (coil tighter and rise), strike (the whip), stuck
 * (the stinger buried, thrashing), retract (slither back up), sweep (lashing low across the floor), spit (the stinger
 * raised to lob), recoil (a hit), dead. Everything is in the model's own space; the fight turns world targets into it
 * with `toLocal`. A pose is a set of waypoints for the spine to run through (a curl, an arch, a long low line): the
 * poses blend by blending their waypoints, so the tail always has a smooth, tail-like shape between any two of them.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const BASE_DIR = V(0.45, 1, -0.3).normalize();

/** the idle curl, as waypoints: up the back, over the top, down the right side, the stinger hanging */
const IDLE_VIA = [V(4.9, 5.6, -3.6), V(6.4, 8.0, -2.4), V(6.9, 8.8, 0.8), V(6.9, 7.4, 3.9)];
const IDLE_END = V(7.0, 6.1, 4.8);
const IDLE_DIR = V(0.2, -0.86, 0.46).normalize();
export const IDLE_TIP = IDLE_END.clone().addScaledVector(IDLE_DIR, STING_LEN);

const _a = newCtrl();
const _b = newCtrl();
const _c = newCtrl();
const t1 = V();
const t2 = V();
const t3 = V();

/** Relaxed: curled over the back, swaying with a wave that runs down it, shivering now and then. */
export function idlePose(t: number, out: TailCtrl) {
  for (let i = 0; i < IDLE_VIA.length; i++) {
    const k = (i + 1) / IDLE_VIA.length;
    out.via[i]!.set(IDLE_VIA[i]!.x + Math.sin(t * 0.6 + i * 1.3) * 0.35 * k, IDLE_VIA[i]!.y + Math.sin(t * 0.8 + i) * 0.3 * k, IDLE_VIA[i]!.z + Math.sin(t * 0.5 + i * 2) * 0.35 * k);
  }
  out.viaW = 1;
  out.tip.set(IDLE_TIP.x + Math.sin(t * 0.55) * 0.5, IDLE_TIP.y + Math.sin(t * 0.8 + 1) * 0.4, IDLE_TIP.z + Math.sin(t * 0.47 + 2) * 0.45);
  out.tipDir.copy(IDLE_DIR);
  out.baseDir.copy(BASE_DIR);
  out.len = TAIL_L_IDLE;
  // a shiver every few seconds: the whole spine twitches
  const ph = t % 6.4;
  const shiver = ph < 0.55 ? Math.sin((ph / 0.55) * Math.PI) : 0;
  out.wave = 0.3 + shiver * 1.2;
  out.waveHz = 0.45 + shiver * 9;
  out.glow = 0.12 + shiver * 0.5;
  out.lag = 0.2;
  out.bristle = 0.15 + shiver * 0.7;
}

/** The cocked tail: coiled tighter and higher than the idle curl, the stinger drawn back over the body and turned to its target. */
function cockedPose(nx: number, nz: number, out: TailCtrl) {
  out.via[0]!.set(4.6, 6.6, -4.2);
  out.via[1]!.set(5.6, 9.0, -3.4);
  out.via[2]!.set(5.9 + nx * 0.7, 9.8, -0.6 + nz * 0.7);
  out.via[3]!.set(5.9 + nx * 1.4, 9.2, 1.4 + nz * 1.4);
  out.viaW = 1;
  out.tipDir.set(nx * 0.45, -0.7, nz * 0.45).normalize();
  const E = t1.set(6.3 + nx * 1.8, 8.2, 2.4 + nz * 1.8);
  out.tip.copy(E).addScaledVector(out.tipDir, STING_LEN);
  out.baseDir.set(0.3, 1, -0.45).normalize();
  out.len = TAIL_L_IDLE + 1.5;
  out.wave = 0.9;
  out.waveHz = 7;
  out.glow = 1;
  out.lag = 0.17;
  out.bristle = 1;
}

function dirTo(target: THREE.Vector3): [number, number] {
  const dx = target.x - TAIL_BASE.x;
  const dz = target.z - TAIL_BASE.z;
  const dl = Math.hypot(dx, dz) || 1;
  return [dx / dl, dz / dl];
}

/**
 * The tail stretched out to reach a floor point: waypoints along an arch from the root to the stinger, the arch higher the
 * more slack there is. `tipY` is how deep the needle is (a little under the floor when it is in).
 */
function reachPose(target: THREE.Vector3, tipY: number, out: TailCtrl) {
  const [nx, nz] = dirTo(target);
  out.tipDir.set(nx * 0.28, -0.95, nz * 0.28).normalize();
  out.tip.set(target.x, tipY, target.z);
  const E = t2.copy(out.tip).addScaledVector(out.tipDir, -STING_LEN);
  const B = TAIL_BASE;
  const chord = Math.hypot(E.x - B.x, E.y - B.y, E.z - B.z);
  // an arch: it rises quickly off the back and comes down on the target
  const H = Math.min(8.0, Math.max(3.2, Math.sqrt(0.375 * chord * (0.14 * chord + 3))));
  const S = [0.16, 0.36, 0.62];
  for (let i = 0; i < 3; i++) {
    const s = S[i]!;
    const a = Math.sin(Math.PI * Math.pow(s, 0.72));
    out.via[i]!.set(B.x + (E.x - B.x) * s, B.y + (E.y - B.y) * s + H * a + (i === 0 ? 2.0 : 0), B.z + (E.z - B.z) * s);
  }
  // the last waypoint is straight above the stinger's base, so the tail comes down along the needle
  out.via[3]!.copy(E).addScaledVector(out.tipDir, -2.8);
  out.viaW = 1;
  out.baseDir.set(0.3, 1, -0.45).normalize();
  out.len = Math.min(TAIL_LMAX, chord * 1.1 + 4);
  out.wave = 0;
  out.waveHz = 7;
  out.glow = 1;
  out.lag = 0.13;
  out.bristle = 1;
}

/** Anticipation: the tail coils tighter and rises, the stinger turns to its target and glows. u 0..1. */
export function rearPose(u: number, t: number, target: THREE.Vector3, out: TailCtrl) {
  idlePose(t, _a);
  const [nx, nz] = dirTo(target);
  cockedPose(nx, nz, _b);
  const e = smooth(u);
  // tremble more as it nears the release
  const k = e * e;
  _b.tip.x += Math.sin(t * 38) * 0.2 * k;
  _b.tip.y += Math.sin(t * 31 + 1) * 0.25 * k;
  mixCtrl(out, _a, _b, e);
}

/** The whip: from cocked to the floor in one accelerating swing; u 0..1, 1 = the needle is in the floor. */
export function strikePose(u: number, t: number, target: THREE.Vector3, out: TailCtrl) {
  const [nx, nz] = dirTo(target);
  cockedPose(nx, nz, _b);
  reachPose(target, -0.55, _c);
  const e = Math.pow(clamp01(u), 1.8);
  mixCtrl(out, _b, _c, e);
  // the tip goes through the floor a little: the needle plunges in
  out.tip.y -= 0.7 * Math.sin(Math.PI * Math.min(1, u)) * 0.6;
  out.wave = lerp(0.9, 0.0, smooth(u * 1.5));
  out.lag = 0.12;
  void t;
}

/** The stinger is buried in the floor and the tail thrashes. `s` is seconds since it stuck. */
export function stuckPose(s: number, t: number, target: THREE.Vector3, out: TailCtrl) {
  reachPose(target, -0.55, out);
  out.tip.set(target.x + Math.sin(s * 23) * 0.1, -0.55 + Math.sin(s * 31) * 0.07, target.z + Math.cos(s * 19) * 0.1);
  const ramp = clamp01(s * 4);
  out.wave = 1.25 * ramp + 0.2 * Math.sin(s * 2);
  out.waveHz = 5.5 + Math.sin(s * 3) * 1.5;
  out.glow = 0.85;
  out.lag = 0.1;
  void t;
}

/** Wrenching free and slithering back up into the curl. u 0..1 */
export function retractPose(u: number, t: number, from: THREE.Vector3, out: TailCtrl) {
  idlePose(t, _b);
  reachPose(from, -0.55, _a);
  const e = smooth(u);
  mixCtrl(out, _a, _b, e);
  // the needle comes up out of the floor first, then over: it rises higher than either end of its path
  out.tip.y += Math.sin(Math.PI * e) * 5.5;
  out.wave = lerp(1.4, 0.35, e);
  out.waveHz = lerp(4.5, 0.6, e);
  out.glow = lerp(0.8, 0.12, e);
  out.lag = 0.2;
  out.bristle = lerp(1, 0.15, e);
}

/**
 * Lashing low across the floor like a whip: the tail is laid along the floor at bearing `th` from the pivot (model space),
 * touching down at radius `rin` and reaching out to `rtip`, its root arched over the shoulder.
 */
export function sweepPose(th: number, rin: number, rtip: number, pivot: THREE.Vector3, out: TailCtrl) {
  const sx = Math.sin(th);
  const cz = Math.cos(th);
  out.via[0]!.set(3.2, 11.0, 0.0);
  out.via[1]!.set(pivot.x + sx * rin * 0.65, 6.5, pivot.z + cz * rin * 0.65);
  out.via[2]!.set(pivot.x + sx * rin * 1.05, 0.7, pivot.z + cz * rin * 1.05);
  out.via[3]!.set(pivot.x + sx * (rin + (rtip - rin) * 0.5), 0.6, pivot.z + cz * (rin + (rtip - rin) * 0.5));
  out.viaW = 1;
  out.tip.set(pivot.x + sx * rtip, 0.55, pivot.z + cz * rtip);
  out.tipDir.set(sx, -0.12, cz).normalize();
  out.baseDir.set(0.25, 1, -0.4).normalize();
  out.len = TAIL_LMAX;
  out.wave = 0.25;
  out.waveHz = 3;
  out.glow = 0.7;
  out.lag = 0.26;
  out.bristle = 1;
}

/** The stinger held up high, aimed at where the blobs will fly: the venom spit. u 0..1 for the rise. */
export function spitPose(u: number, t: number, target: THREE.Vector3, kick: number, out: TailCtrl) {
  idlePose(t, _a);
  const [nx, nz] = dirTo(target);
  cockedPose(nx, nz, _b);
  // the stinger lifts to aim up and out over the arena; each lob kicks it back
  _b.tipDir.set(nx * 0.75, 0.5, nz * 0.75).normalize();
  const E = t1.set(6.3 + nx * 2.4, 9.4 - kick * 1.3, 3.0 + nz * 2.4);
  _b.tip.copy(E).addScaledVector(_b.tipDir, STING_LEN);
  _b.via[3]!.set(6.0 + nx * 1.8, 10.2 - kick * 0.6, 2.0 + nz * 1.8);
  _b.wave = 0.7 + kick * 0.8;
  _b.waveHz = 5;
  mixCtrl(out, _a, _b, smooth(u));
}

/** Dead: the tail goes limp and slumps behind the bell. t seconds into the death. */
export function deadPose(t: number, out: TailCtrl) {
  idlePose(t, _a);
  _b.tip.set(6.4, 0.5, -9.0);
  _b.tipDir.set(0.4, -0.15, -0.9).normalize();
  _b.baseDir.set(0.5, 0.9, -0.4).normalize();
  _b.len = 24;
  _b.viaW = 0;
  _b.wave = 0.2;
  _b.waveHz = 1.2;
  _b.glow = 0;
  _b.lag = 0.4;
  _b.bristle = 0;
  for (let i = 0; i < VIA_N; i++) _b.via[i]!.copy(_a.via[i]!);
  mixCtrl(out, _a, _b, smooth((t - 0.7) / 1.8));
}

/** A hit: the tail jerks up and back, thrashing. u 0..1 */
export function recoilPose(u: number, t: number, out: TailCtrl) {
  idlePose(t, _a);
  cockedPose(0, -1, _b);
  _b.via[2]!.set(3.2, 11.4, -3);
  _b.via[3]!.set(2.0, 10.6, -4.6);
  _b.tipDir.set(0.2, 0.3, -0.9).normalize();
  _b.tip.set(1.5, 10.2, -6.5);
  _b.wave = 2.2;
  _b.waveHz = 9;
  _b.glow = 0.2;
  _b.lag = 0.1;
  mixCtrl(out, _a, _b, smooth(Math.min(1, u * 2.2)) * (1 - smooth((u - 0.45) * 2)));
}

void t3;
export { copyCtrl, mixCtrl } from './mash-tail';
export { newCtrl };
