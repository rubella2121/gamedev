import path from 'path';
import { defineConfig } from 'vite';

/** A separate build for the dev tools: the boss concept-art gallery and the voice lab. It never ships with the game. */
export default defineConfig({
  root: path.resolve(__dirname, 'tools'),
  base: './',
  esbuild: { target: 'es2022' },
  build: {
    target: 'es2022',
    outDir: path.resolve(__dirname, 'dist-gallery'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: { input: { gallery: path.resolve(__dirname, 'tools/gallery.html'), voicelab: path.resolve(__dirname, 'tools/voicelab.html') } },
  },
});
