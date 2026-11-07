import path from 'path';
import { defineConfig } from 'vite';

/**
 * CrazyGames build: the RUN SDK is swapped for src/sdk.crazygames.ts (their HTML5 SDK v3: loading and gameplay events, a
 * midgame ad at the natural breaks, their data module for saves), and the page loads their SDK before the game. Three.js is
 * bundled in. No test bots.
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.crazygames.ts') }],
  },
  plugins: [
    {
      name: 'crazygames-sdk',
      transformIndexHtml: (html) => html.replace('</title>', '</title>\n    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'),
    },
  ],
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: 'dist-crazygames', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
