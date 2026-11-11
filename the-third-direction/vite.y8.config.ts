import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * Y8 build: the RUN SDK is swapped for src/sdk.y8.ts (no SDK: Y8 runs its own ads around the frame; saves in localStorage;
 * new players land straight in a run). Everything is in the zip (three.js bundled, no outside scripts). No test bots. Most of
 * Y8's players are on a desktop, in landscape: around the tall frame of the game the page shows the guardians and the 3D
 * bosses (the same art as the CrazyGames build, brand/crazygames/desktop-bg.jpg) instead of black bars.
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.y8.ts') }],
  },
  plugins: [
    {
      name: 'y8-page',
      transformIndexHtml: (html) =>
        html.replace(
          '</title>',
          '</title>\n    <style>html body { background: #05060c url(./desktop-bg.jpg) center / auto 100% no-repeat; }</style>',
        ),
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'desktop-bg.jpg', source: fs.readFileSync(path.resolve(__dirname, 'brand/crazygames/desktop-bg.jpg')) });
      },
    },
  ],
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: 'dist-y8', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
