import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/shot': 'http://localhost:3001',
    },
  },
});
