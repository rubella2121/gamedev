import path from 'path';
import { defineConfig } from 'vite';

/** A separate build for the boss concept-art gallery (tools/gallery.ts). It never ships with the game. */
export default defineConfig({
  root: path.resolve(__dirname, 'tools'),
  base: './',
  esbuild: { target: 'es2022' },
  build: {
    target: 'es2022',
    outDir: path.resolve(__dirname, 'dist-gallery'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: { input: path.resolve(__dirname, 'tools/gallery.html') },
  },
});
