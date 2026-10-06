import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Permite exponer la demo con un túnel temporal de Cloudflare (ver docs/despliegue.md, opción B).
    allowedHosts: ['.trycloudflare.com'],
    // En desarrollo, /api se reenvía al backend NestJS.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
