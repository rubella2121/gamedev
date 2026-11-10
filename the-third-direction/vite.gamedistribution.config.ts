import path from 'path';
import { defineConfig } from 'vite';

/**
 * GameDistribution build: the RUN SDK is swapped for src/sdk.gamedistribution.ts, and the page loads their HTML5 SDK
 * (html5.api.gamedistribution.com/main.min.js) with `window.GD_OPTIONS`: the game's id from their control panel, and an
 * `onEvent` that hands every event to the game. Three.js is bundled in. No test bots.
 *   GD_GAME_ID=<the id> npm run build:gamedistribution
 * Around the game's tall frame, a desktop shows the same art as on CrazyGames (brand/crazygames/desktop-bg.jpg).
 */
const id = process.env.GD_GAME_ID;
if (!id || !/^[a-f0-9]{32}$/i.test(id)) {
  throw new Error('GD_GAME_ID: the 32-character game id from the GameDistribution control panel (GD_GAME_ID=... npm run build:gamedistribution)');
}
const head = `
    <script>
      window.GD_OPTIONS = {
        gameId: '${id}',
        onEvent: function (event) {
          (window.__gdListeners || []).slice().forEach(function (f) { try { f(event); } catch (e) { /* a listener's own trouble */ } });
        },
      };
      (function (d, s, id) {
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) return;
        js = d.createElement(s);
        js.id = id;
        js.src = 'https://html5.api.gamedistribution.com/main.min.js';
        fjs.parentNode.insertBefore(js, fjs);
      })(document, 'script', 'gamedistribution-jssdk');
    </script>
    <style>html body { background: #05060c url(./desktop-bg.jpg) center / auto 100% no-repeat; }</style>`;

export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.gamedistribution.ts') }],
  },
  publicDir: 'public',
  plugins: [
    {
      name: 'gamedistribution-sdk',
      transformIndexHtml: (html) => html.replace('</title>', `</title>${head}`),
      async generateBundle() {
        const fs = await import('fs');
        this.emitFile({ type: 'asset', fileName: 'desktop-bg.jpg', source: fs.readFileSync(path.resolve(__dirname, 'brand/crazygames/desktop-bg.jpg')) });
      },
    },
  ],
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: 'dist-gamedistribution', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
