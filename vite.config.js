import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    fs: { allow: ['..'] },
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
});
