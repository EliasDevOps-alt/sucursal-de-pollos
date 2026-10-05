import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo, /api se reenvía al backend NestJS.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
