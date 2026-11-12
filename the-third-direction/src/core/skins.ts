import { REWARDED, storageGet, storageSet } from '../sdk';
import type { SkinId } from './blobskins';

/**
 * The Blob's skins: which it owns, which it wears, and how the rest are won. Where the site has rewarded ads (CrazyGames,
 * GameDistribution, Y8) Explorer, Knight, Wizard and Inferno are unlocked by watching them, one, two, two and three; where it has
 * none (itch.io, RUN, the Artifact) by getting that far in the game instead. Golden is never for sale: beat the game on
 * Nightmare. Everything is saved as it happens, ads watched part-way included.
 */
export interface SkinInfo {
  id: SkinId;
  name: string;
  /** what it is, in a few words */
  blurb: string;
  /** ads to watch, where there are ads (0: it is not unlocked with ads) */
  ads: number;
  /** what to do in the game to unlock it, where there are no ads (and always for Golden) */
  goal: string;
  /** its colour, for the wardrobe */
  colour: string;
}

export const SKINS: SkinInfo[] = [
  { id: 'default', name: 'Blob', blurb: 'just you, as you are', ads: 0, goal: '', colour: '#f2d36b' },
  { id: 'explorer', name: 'Explorer', blurb: 'a leather cap, brass goggles, a scarf in the wind', ads: 1, goal: 'Beat your first guardian', colour: '#e0a060' },
  { id: 'knight', name: 'Knight', blurb: 'a steel helmet with a crest of red feathers', ads: 2, goal: 'Fall into the third dimension', colour: '#c8d4e4' },
  { id: 'wizard', name: 'Wizard', blurb: 'a starry hat and a purple cape', ads: 2, goal: 'Beat X, the Hollow', colour: '#9a7cff' },
  { id: 'inferno', name: 'Inferno', blurb: 'horns, and fire all over', ads: 3, goal: 'Beat the game', colour: '#ff7a2a' },
  { id: 'golden', name: 'Golden', blurb: 'a crown, a royal cape, all gold', ads: 0, goal: 'Beat the game on Nightmare', colour: '#ffc21c' },
];

/** what the Blob is wearing right now: the forest and the 3D fights read it whenever they draw it */
export const SKIN: { id: SkinId } = { id: 'default' };

/** the things a run can do that win a skin where there are no ads */
export type Milestone = 'guardian' | 'fell' | 'x' | 'clear' | 'nightmare';
const MILESTONE: Record<Milestone, SkinId> = { guardian: 'explorer', fell: 'knight', x: 'wizard', clear: 'inferno', nightmare: 'golden' };

const WEAR = 'tt.skin';
const OWN = 'tt.skins';
const ADS = 'tt.skins.ads';

const info = (id: SkinId) => SKINS.find((s) => s.id === id)!;

function owned(): Set<SkinId> {
  const v = storageGet(OWN);
  const ids = new Set<SkinId>(['default']);
  for (const id of (v ?? '').split(',')) if (SKINS.some((s) => s.id === id)) ids.add(id as SkinId);
  return ids;
}

function adsSeen(): Partial<Record<SkinId, number>> {
  try {
    const v = JSON.parse(storageGet(ADS) || '{}') as Record<string, unknown>;
    const out: Partial<Record<SkinId, number>> = {};
    for (const s of SKINS) if (typeof v[s.id] === 'number') out[s.id] = v[s.id] as number;
    return out;
  } catch {
    return {};
  }
}

/** read what was saved: call once storage is ready */
export function loadSkins() {
  const v = storageGet(WEAR) as SkinId | null;
  SKIN.id = v && owns(v) ? v : 'default';
}

export function owns(id: SkinId): boolean {
  return owned().has(id);
}

/** is this skin won by watching ads here (rather than by playing)? */
export function byAds(id: SkinId): boolean {
  return REWARDED && info(id).ads > 0;
}

/** ads watched to the end for this skin so far */
export function adsWatched(id: SkinId): number {
  return adsSeen()[id] ?? 0;
}

export function wear(id: SkinId) {
  if (!owns(id)) return;
  SKIN.id = id;
  storageSet(WEAR, id);
}

/** give the Blob a skin; true if it did not have it yet */
export function unlock(id: SkinId): boolean {
  const ids = owned();
  if (ids.has(id)) return false;
  ids.add(id);
  storageSet(OWN, [...ids].filter((s) => s !== 'default').join(','));
  return true;
}

/** one more ad watched to the end for this skin: true when that was the last one it needed (it is unlocked then) */
export function adWatched(id: SkinId): boolean {
  if (owns(id)) return false;
  const seen = adsSeen();
  const n = (seen[id] ?? 0) + 1;
  seen[id] = n;
  storageSet(ADS, JSON.stringify(seen));
  return n >= info(id).ads && unlock(id);
}

/**
 * Something happened in a real run (never the showcase): where it wins a skin here, the skin is unlocked. Returns the skin that
 * was new, if one was, so the game can say so.
 */
export function milestone(m: Milestone): SkinInfo | null {
  const id = MILESTONE[m];
  // where there are ads, the four are bought with ads; Golden is won on Nightmare everywhere
  if (byAds(id)) return null;
  return unlock(id) ? info(id) : null;
}

const SEEN = 'tt.skins.seen';

/** has the player opened the wardrobe yet? (until then its button on the home page glows) */
export function wardrobeSeen(): boolean {
  return storageGet(SEEN) === '1';
}

export function markWardrobeSeen() {
  storageSet(SEEN, '1');
}
