import path from 'path';
import { defineConfig } from 'vite';

/**
 * Single-file build for a claude.ai Artifact: the RUN SDK is swapped for the no-op stub, Three.js is bundled in, and everything
 * ends up in one script so tools/make-artifact.mjs can inline it into one page. No test bots. Not for RUN deploys.
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^(\.\/|\.\.\/)+sdk$/, replacement: path.resolve(__dirname, 'src/sdk.stub.ts') }],
  },
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: {
    target: 'es2022',
    outDir: 'dist-artifact',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
