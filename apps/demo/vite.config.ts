import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project subpath.
  base: './',
  // transformers.js ships its own workers/wasm; let it resolve at runtime.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'es2022' },
})
