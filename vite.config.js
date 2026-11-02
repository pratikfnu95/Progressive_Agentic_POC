import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['fc72-2601-8c-4082-1860-359d-6efd-2538-181f.ngrok-free.app'],
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
