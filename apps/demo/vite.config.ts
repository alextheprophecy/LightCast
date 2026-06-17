import { defineConfig } from 'vite'

export default defineConfig({
  // onnxruntime-web ships large wasm/binary assets; don't pre-bundle them.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
