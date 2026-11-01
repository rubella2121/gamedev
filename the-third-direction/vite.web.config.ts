import path from 'path';
import { defineConfig } from 'vite';

/** Web build for itch.io and other game sites: the RUN SDK is swapped for src/sdk.web.ts (localStorage saves), Three.js is bundled in. No test bots. */
export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.web.ts') }],
  },
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: 'dist-web', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
