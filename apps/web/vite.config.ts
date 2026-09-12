import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'production'
      ? [{ name: 'strip-production-sample-assets', closeBundle: () => rmSync(path.resolve(__dirname, 'dist/trichoscopy'), { recursive: true, force: true }) }]
      : []),
  ],
  // M1d: demo/test fixtures remain available in dev, while production strips
  // only the legacy public sample assets. Other public assets remain intact.
  build: {
    // WEAKNESSES M15: the bundle budget measures the REAL initial payload by
    // walking this manifest and its static import graph (tools/bundle-budget.ts).
    manifest: true,
  },
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
}));
