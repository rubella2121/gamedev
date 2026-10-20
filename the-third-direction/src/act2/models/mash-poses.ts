import * as THREE from 'three';
import { TAIL_BASE } from './mash-layout';
import { mixCtrl, newCtrl, TAIL_L_IDLE, TAIL_LMAX, type TailCtrl } from './mash-tail';

/**
 * The tail's poses, as controls for `ScorpionTail`: idle curl, rear (coil tighter and rise), strike (the whip), stuck
 * (the stinger buried, thrashing), retract (slither back up), sweep (lashing low across the floor), spit (the stinger
 * raised to lob), recoil (a hit). Everything is in the model's own space; the fight turns world targets into it with
 * `toLocal`. The curled poses are shaped by hand (waypoints); the ones that reach for a floor point are solved arcs.
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
const IDLE_VIA = [V(5.6, 7.2, -4.0), V(7.8, 11.6, -2.8), V(8.2, 12.4, 1.2), V(8.2, 10.2, 4.6)];
const IDLE_END = V(8.3, 8.1, 5.6);
const IDLE_DIR = V(0.2, -0.86, 0.46).normalize();
export const IDLE_TIP = IDLE_END.clone().addScaledVector(IDLE_DIR, 4.25);

const _a = newCtrl();
const _b = newCtrl();
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
  out.len = TAIL_L_IDLE + Math.sin(t * 0.6) * 0.4;
  // a shiver every few seconds: the whole spine twitches
  const ph = t % 6.4;
  const shiver = ph < 0.55 ? Math.sin((ph / 0.55) * Math.PI) : 0;
  out.wave = 0.3 + shiver * 1.2;
  out.waveHz = 0.45 + shiver * 9;
  out.glow = 0.12 + shiver * 0.5;
  out.lag = 0.2;
  out.bristle = 0.15 + shiver * 0.7;
}

/** The cocked tail: coiled tighter and higher than the idle curl, the stinger turned towards where it will strike. */
function cockedPose(nx: number, nz: number, out: TailCtrl) {
  out.via[0]!.set(5.2, 7.6, -4.4);
  out.via[1]!.set(6.6, 11.4, -3.4);
  out.via[2]!.set(6.8 + nx * 1.2, 12.8, 0.2 + nz * 1.2);
  out.via[3]!.set(6.6 + nx * 2.4, 12.2, 3.4 + nz * 2.4);
  out.viaW = 1;
  out.tipDir.set(nx * 0.6, -0.5, nz * 0.6).normalize();
  const E = t1.set(7.0 + nx * 3.0, 11.2, 4.8 + nz * 3.0);
  out.tip.copy(E).addScaledVector(out.tipDir, 4.25);
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

/** The length the tail needs to reach a floor point. */
export function lenFor(target: THREE.Vector3): number {
  const d = Math.hypot(target.x - TAIL_BASE.x, target.y - TAIL_BASE.y, target.z - TAIL_BASE.z);
  return Math.min(TAIL_LMAX, Math.max(TAIL_L_IDLE, d * 1.045 + 2));
}

/** The whip: from cocked to the floor in one accelerating swing; u 0..1, 1 = the needle is in the floor. */
export function strikePose(u: number, t: number, target: THREE.Vector3, out: TailCtrl) {
  const [nx, nz] = dirTo(target);
  cockedPose(nx, nz, _b);
  const A = t2.copy(_b.tip);
  const T = t3.set(target.x, -0.5, target.z);
  // a swing that goes out and over, not a straight line: the control point is high and ahead of the target
  const Cy = Math.max(A.y, 10) + 3;
  const e = Math.pow(clamp01(u), 2.0);
  const m = 1 - e;
  const Cx = (A.x + T.x) * 0.5;
  const Cz = (A.z + T.z) * 0.5;
  out.tip.set(m * m * A.x + 2 * m * e * Cx + e * e * T.x, m * m * A.y + 2 * m * e * Cy + e * e * T.y, m * m * A.z + 2 * m * e * Cz + e * e * T.z);
  // it leaves pointing down and ahead, and arrives pointing into the floor
  const k = smooth(u * 1.3);
  out.tipDir.set(nx * lerp(0.5, 0.3, k), lerp(-0.8, -0.95, k), nz * lerp(0.5, 0.3, k)).normalize();
  out.baseDir.set(0.3, 1, -0.45).normalize();
  out.baseDir.lerp(V(nx * 0.55, 0.85, nz * 0.55 - 0.1).normalize(), smooth(u * 1.2)).normalize();
  out.len = lerp(TAIL_L_IDLE + 1.5, lenFor(target), smooth(u * 1.15));
  out.wave = lerp(0.9, 0.0, smooth(u * 1.5));
  out.waveHz = 7;
  out.glow = 1;
  out.lag = 0.13;
  out.bristle = 1 - 0.4 * u;
  for (let i = 0; i < out.via.length; i++) out.via[i]!.copy(_b.via[i]!);
  out.viaW = 1 - smooth(u * 2.4);
}

/** The stinger is buried in the floor and the tail thrashes. `s` is seconds since it stuck. */
export function stuckPose(s: number, t: number, target: THREE.Vector3, out: TailCtrl) {
  strikePose(1, t, target, out);
  out.tip.set(target.x + Math.sin(s * 23) * 0.1, -0.55 + Math.sin(s * 31) * 0.07, target.z + Math.cos(s * 19) * 0.1);
  out.tipDir.set(Math.sin(s * 5) * 0.1, -1, Math.cos(s * 4.3) * 0.1).normalize();
  const ramp = clamp01(s * 4);
  out.wave = 1.25 * ramp + 0.2 * Math.sin(s * 2);
  out.waveHz = 5.5 + Math.sin(s * 3) * 1.5;
  out.glow = 0.85;
  out.lag = 0.1;
  out.bristle = 1;
  out.viaW = 0;
}

/** Wrenching free and slithering back up into the curl. u 0..1. */
export function retractPose(u: number, t: number, from: THREE.Vector3, out: TailCtrl) {
  idlePose(t, _b);
  const fromLen = lenFor(from);
  const A = t1.set(from.x, 0, from.z);
  const e = smooth(u);
  // first straight up out of the floor, then over in an arc to the curl
  const C = t3.set((from.x + _b.tip.x) * 0.5, 13, (from.z + _b.tip.z) * 0.5);
  const m = 1 - e;
  out.tip.set(m * m * A.x + 2 * m * e * C.x + e * e * _b.tip.x, m * m * A.y + 2 * m * e * C.y + e * e * _b.tip.y, m * m * A.z + 2 * m * e * C.z + e * e * _b.tip.z);
  out.tipDir.set(0, -1, 0).lerp(_b.tipDir, smooth(u * 1.4)).normalize();
  out.baseDir.copy(BASE_DIR);
  out.len = lerp(fromLen, TAIL_L_IDLE, smooth(u * 0.9));
  out.wave = lerp(1.4, 0.35, e);
  out.waveHz = lerp(4.5, 0.6, e);
  out.glow = lerp(0.8, 0.12, e);
  out.lag = 0.2;
  out.bristle = lerp(1, 0.15, e);
  for (let i = 0; i < out.via.length; i++) out.via[i]!.copy(_b.via[i]!);
  out.viaW = smooth((u - 0.35) * 1.8);
}

/** Lashing low across the floor like a whip: the tip runs round the arc at radius `R` from the pivot at angle `th`. */
export function sweepPose(th: number, R: number, pivot: THREE.Vector3, out: TailCtrl) {
  const sx = Math.sin(th);
  const cz = Math.cos(th);
  out.tip.set(pivot.x + sx * R, 0.55, pivot.z + cz * R);
  out.tipDir.set(sx, -0.22, cz).normalize();
  out.baseDir.set(0.25, 1, -0.5).normalize();
  const d = Math.hypot(out.tip.x - TAIL_BASE.x, out.tip.z - TAIL_BASE.z);
  out.len = Math.min(TAIL_LMAX, Math.max(TAIL_L_IDLE, d * 1.06 + 3));
  out.wave = 0.35;
  out.waveHz = 2;
  out.glow = 0.6;
  out.lag = 0.3;
  out.bristle = 1;
  out.viaW = 0;
}

/** The stinger held up high, aimed at where the blobs will fly: the venom spit. u 0..1 for the rise. */
export function spitPose(u: number, t: number, target: THREE.Vector3, kick: number, out: TailCtrl) {
  idlePose(t, _a);
  const [nx, nz] = dirTo(target);
  cockedPose(nx, nz, _b);
  // the stinger lifts to aim up and out over the arena; each lob kicks it back
  _b.tipDir.set(nx * 0.75, 0.5, nz * 0.75).normalize();
  const E = t1.set(7.4 + nx * 3.0, 12.4 - kick * 1.4, 4.6 + nz * 3.0);
  _b.tip.copy(E).addScaledVector(_b.tipDir, 4.25);
  _b.via[3]!.set(6.8 + nx * 2.2, 13.2, 3.4 + nz * 2.2);
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
  for (let i = 0; i < _b.via.length; i++) _b.via[i]!.copy(_a.via[i]!);
  mixCtrl(out, _a, _b, smooth((t - 0.7) / 1.8));
}

/** A hit: the tail jerks up and back, thrashing. u 0..1 */
export function recoilPose(u: number, t: number, out: TailCtrl) {
  idlePose(t, _a);
  cockedPose(0, -1, _b);
  _b.via[2]!.set(3.5, 15.5, -3);
  _b.via[3]!.set(2.0, 14.5, -4.6);
  _b.tipDir.set(0.2, 0.3, -0.9).normalize();
  _b.tip.set(1.5, 14.0, -6.5);
  _b.wave = 2.2;
  _b.waveHz = 9;
  _b.glow = 0.2;
  _b.lag = 0.1;
  mixCtrl(out, _a, _b, smooth(Math.min(1, u * 2.2)) * (1 - smooth((u - 0.45) * 2)));
}

export { copyCtrl, mixCtrl } from './mash-tail';
export { newCtrl };
