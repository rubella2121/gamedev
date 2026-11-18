import './style.css';
import { setView, viewFor } from './core/pix';
import { Game } from './game';

// the view's shape, once, from the screen's (?view=216x384 forces one, for tools)
const forced = /^(\d+)x(\d+)$/.exec(new URLSearchParams(location.search).get('view') ?? '');
if (forced) setView(Number(forced[1]), Number(forced[2]));
else setView(...viewFor(window.innerWidth / Math.max(1, window.innerHeight)));

const root = document.getElementById('app')!;
const game = new Game(root);
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __tt: unknown }).__tt = game;
  if (__BOTS__) {
    void import('./dev/bots').then((m) => m.installBots(game));
    void import('./dev/bots3d').then((m) => m.installBots3d(game));
  }
}
