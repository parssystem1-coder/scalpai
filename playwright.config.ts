import { defineConfig } from "@playwright/test";

/**
 * Slice T3 - browser @smoke against REAL local stack:
 *   API  : node dist/main.js on :3001 (loadEnv reads .env -> native PG17, ADR-0024)
 *   Web  : vite dev on :5173 with VITE_API_URL pointed at the API
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @scalpai/db build && pnpm --filter @scalpai/shared build && pnpm --filter @scalpai/analysis-core build && pnpm --filter @scalpai/app-api build && pnpm --filter @scalpai/app-api exec env PORT=3001 node dist/main.js",
      url: "http://127.0.0.1:3001/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
    {
      command: "pnpm --filter @scalpai/app-web exec vite --port 5173 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_API_URL: "http://127.0.0.1:3001/api/v1",
      },
    },
  ],
});
