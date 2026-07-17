// Vite config to bundle Grapher + deps for Electron main process (CJS)
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'electron/grapher-entry.js'),
      name: 'GrapherBundle',
      formats: ['cjs'],
      fileName: () => 'grapher-bundle.cjs',
    },
    outDir: 'electron/bundle',
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: ['@napi-rs/canvas', 'electron', 'fs', 'path', 'child_process'],
    },
  },
});
