import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(import.meta.dirname, '..');

export default defineConfig(({ mode }) => {
  // Read PORT from the shared root .env so the dev proxy always targets the API server.
  // Only PORT is used here; nothing from .env is exposed to browser code.
  const { PORT = '3001' } = loadEnv(mode, repoRoot, '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${PORT}`,
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
