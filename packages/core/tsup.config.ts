import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Keep the (large) ML runtime out of our bundle; consumers/bundlers resolve it.
  external: ['onnxruntime-web'],
})
