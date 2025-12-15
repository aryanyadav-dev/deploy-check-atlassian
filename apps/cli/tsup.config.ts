import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  dts: false,
  shims: true,
  noExternal: [/@dra\/.*/],
  esbuildOptions(options) {
    options.platform = 'node';
    // Remove shebang from source, we'll add it via banner
    options.banner = {
      js: '#!/usr/bin/env node',
    };
  },
  onSuccess: 'chmod +x dist/index.js',
});
