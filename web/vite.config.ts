import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas en archivos aparte: cambian poco, así el navegador las conserva entre versiones del panel.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](recharts|d3-[a-z-]+|victory-vendor|@mantine[\/]charts)[\/]/.test(id)) return 'charts';
          if (/[\/](leaflet|react-leaflet|@react-leaflet)[\/]/.test(id)) return 'maps';
          if (/[\/](@mantine|@floating-ui)[\/]/.test(id)) return 'mantine';
          if (/[\/](@tabler)[\/]/.test(id)) return 'icons';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    // Permite exponer la demo con un túnel temporal de Cloudflare (ver docs/despliegue.md, opción B).
    allowedHosts: ['.trycloudflare.com'],
    // En desarrollo, /api se reenvía al backend NestJS.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
