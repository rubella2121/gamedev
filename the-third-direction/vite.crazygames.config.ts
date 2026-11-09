import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * CrazyGames build: the RUN SDK is swapped for src/sdk.crazygames.ts (their HTML5 SDK v3: loading and gameplay events, a
 * midgame ad at the natural breaks, their data module for saves), and the page loads their SDK before the game. Three.js is
 * bundled in. No test bots. Most of their players are on a desktop, in landscape: around the tall frame of the game the page
 * shows the guardians and the 3D bosses (brand/crazygames/desktop-bg.jpg, 16:9, scaled to the height so the art always meets
 * the frame), instead of black bars.
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.crazygames.ts') }],
  },
  plugins: [
    {
      name: 'crazygames-sdk',
      transformIndexHtml: (html) =>
        html.replace(
          '</title>',
          '</title>\n    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>' +
            '\n    <style>html body { background: #05060c url(./desktop-bg.jpg) center / auto 100% no-repeat; }</style>',
        ),
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'desktop-bg.jpg', source: fs.readFileSync(path.resolve(__dirname, 'brand/crazygames/desktop-bg.jpg')) });
      },
    },
  ],
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: 'dist-crazygames', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
