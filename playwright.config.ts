import { defineConfig } from "@playwright/test";

/**
 * Slice T3 - browser @smoke against REAL local stack:
 * API : node dist/main.js on :3001 (loadEnv reads .env -> native PG17, ADR-0024)
 * Web : vite dev on :5173 with VITE_API_URL pointed at the API
 *
 * npm is the only package manager in this repo (ADR-0036): every command below
 * goes through npm/turbo exclusively.
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
        "npm exec -- turbo run build --filter=@scalpai/app-api... && npm run start --workspace=@scalpai/app-api",
      url: "http://127.0.0.1:3001/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        PORT: "3001",
      },
    },
    {
      command: "npm exec --workspace=@scalpai/app-web -- vite --port 5173 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_API_URL: "http://127.0.0.1:3001/api/v1",
      },
    },
  ],
});
