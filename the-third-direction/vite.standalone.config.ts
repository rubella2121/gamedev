import path from 'path';
import { defineConfig } from 'vite';

/** Standalone build: no RUN SDK, Three.js bundled in. For playtesting the game anywhere (not for RUN deploys). */
export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.stub.ts') }],
  },
  define: { __BOTS__: true },
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: 'dist-standalone', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
