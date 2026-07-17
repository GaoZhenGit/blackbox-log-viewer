import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const configs = [
  // 1. Frontend app → dist/
  {
    base: './',
    build: { sourcemap: true },
    define: { '__APP_VERSION__': JSON.stringify(process.env.npm_package_version) },
  },
  // 2. FlightLog CJS bundle → electron/bundle/
  {
    build: {
      lib: {
        entry: path.resolve(root, 'src/flightlog.js'),
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
  },
  // 3. Grapher CJS bundle → electron/bundle/
  {
    build: {
      lib: {
        entry: path.resolve(root, 'electron/grapher-entry.js'),
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
  },
];

for (const cfg of configs) {
  await build({ root, ...cfg });
  console.log('');
}
