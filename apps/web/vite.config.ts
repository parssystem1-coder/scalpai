import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      '@scalpai/sync-client': path.resolve(__dirname, '../../packages/sync-client/src/index.ts'),
      '@scalpai/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@scalpai/analysis-engine': path.resolve(__dirname, '../../packages/analysis-engine/src/index.ts'),
      '@scalpai/analysis-core': path.resolve(__dirname, '../../packages/analysis-core/src/index.ts'),
      '@scalpai/education': path.resolve(__dirname, '../../packages/education/src/index.ts'),
    },
  },
});
