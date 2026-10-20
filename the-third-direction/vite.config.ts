import path from 'path';
import { defineConfig } from 'vite';
import { rundotGameLibrariesPlugin } from '@series-inc/rundot-game-sdk/vite';

export default defineConfig({
  plugins: [rundotGameLibrariesPlugin()],
  base: './',
  server: { allowedHosts: true },
  resolve: {
    alias: {
      // three r170 does not expose ./package.json in its exports map, but the
      // RUN embedded-libraries plugin needs it to detect the installed version.
      'three/package.json': path.resolve(__dirname, 'node_modules/three/package.json'),
    },
  },
  // The RUN SDK uses top-level await, so target an environment that supports it.
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: { target: 'es2022' },
  define: { __BOTS__: false },
});
