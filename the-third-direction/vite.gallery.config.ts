import path from 'path';
import { defineConfig } from 'vite';

/** A separate build for the dev tools: the boss concept-art gallery, the voice lab and the score lab. It never ships with the game. */
export default defineConfig({
  root: path.resolve(__dirname, 'tools'),
  base: './',
  define: { __BOTS__: false },
  esbuild: { target: 'es2022' },
  build: {
    target: 'es2022',
    outDir: path.resolve(__dirname, 'dist-gallery'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: { input: { gallery: path.resolve(__dirname, 'tools/gallery.html'), voicelab: path.resolve(__dirname, 'tools/voicelab.html'), lab3d: path.resolve(__dirname, 'tools/lab3d.html'), scorelab: path.resolve(__dirname, 'tools/scorelab.html') } },
  },
});
