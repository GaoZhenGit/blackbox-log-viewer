// Vite config to bundle FlightLog for Electron main process (CJS)
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/flightlog.js'),
      name: 'FlightLogBundle',
      formats: ['cjs'],
      fileName: () => 'flightlog-bundle.cjs',
    },
    outDir: 'electron/bundle',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: ['@napi-rs/canvas', 'electron', 'fs', 'path', 'child_process'],
    },
  },
});
