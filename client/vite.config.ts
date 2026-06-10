import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // SSE streams through node-http-proxy without buffering.
      '/api': 'http://localhost:8787',
    },
  },
});
