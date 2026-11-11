import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * Y8 build: the RUN SDK is swapped for src/sdk.y8.ts, and the page loads Y8's minimal SDK from their CDN (they ask for it never to
 * be bundled, so their fixes reach the game without a new build) and starts it with this game's App ID and Game ID from the Y8
 * developer portal (Builds -> SDK Initialization). Ads at the natural breaks; saves in localStorage; new players land straight
 * in a run. Three.js is bundled in. No test bots. Most of Y8's players are on a desktop, in landscape: around the tall frame
 * of the game the page shows the guardians and the 3D bosses (the same art as the CrazyGames build) instead of black bars.
 */
const Y8_APP_ID = process.env.Y8_APP_ID ?? '6af4d10aca1c6869a74ed12e';
const Y8_GAME_ID = process.env.Y8_GAME_ID ?? '292565';
const head = `
    <script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async></script>
    <script>
      window.addEventListener('y8sdk.ready', function () {
        var sdk = y8.sdk();
        sdk.init({ appId: '${Y8_APP_ID}', autoLogin: true }, { gameId: '${Y8_GAME_ID}', preloadAdBreaks: 'on', sound: 'on', onReady: function () {} });
        sdk.onAuth(function () {});
        window.__y8Sdk = sdk;
      }, { once: true });
      if (window.y8 && window.y8.emitReadyEvent) window.y8.emitReadyEvent();
    </script>
    <style>html body { background: #05060c url(./desktop-bg.jpg) center / auto 100% no-repeat; }</style>`;

export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.y8.ts') }],
  },
  plugins: [
    {
      name: 'y8-sdk',
      transformIndexHtml: (html) => html.replace('</title>', `</title>${head}`),
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'desktop-bg.jpg', source: fs.readFileSync(path.resolve(__dirname, 'brand/crazygames/desktop-bg.jpg')) });
      },
    },
  ],
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: 'dist-y8', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
