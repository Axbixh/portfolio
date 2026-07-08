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
      // wrangler pages dev serves the Pages Functions locally
      '/api': 'http://localhost:8788',
      '/shot': 'http://localhost:8788',
    },
  },
});
