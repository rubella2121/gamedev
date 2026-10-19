import './style.css';
import { Game } from './game';
import { PATCHES, trailCx } from './act1/layout';

const root = document.getElementById('app')!;
const game = new Game(root);
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __tt: unknown; __trailCx: unknown }).__tt = game;
  (window as unknown as { __trailCx: unknown; __patches: unknown }).__trailCx = trailCx;
  (window as unknown as { __patches: unknown }).__patches = PATCHES;
}
