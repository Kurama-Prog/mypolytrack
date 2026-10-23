import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Three.js is the only heavyweight dependency; split it for long-term caching.
        manualChunks: {
          three: ['three']
        }
      }
    }
  }
});
