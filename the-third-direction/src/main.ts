import './style.css';
import { Game } from './game';

const root = document.getElementById('app')!;
const game = new Game(root);
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __tt: unknown }).__tt = game;
  if (__BOTS__) void import('./dev/bots').then((m) => m.installBots(game));
}
