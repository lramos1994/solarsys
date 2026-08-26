import { defineConfig } from 'vite';

// D-14/QLT-008: the application builds to plain static assets with no server
// runtime. `base: './'` keeps the build servable from any directory or host.
export default defineConfig({
  root: 'ts/app',
  base: './',
  build: {
    outDir: '../../build',
    emptyOutDir: true,
    target: 'es2022',
  },
});
