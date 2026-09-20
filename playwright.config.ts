import { defineConfig } from "@playwright/test";

/**
 * Browser suite against the REAL local stack (WEAKNESSES H15):
 *   API : node dist/main.js on API_PORT (loadEnv reads .env -> native PG17, ADR-0024)
 *   Web : vite dev on WEB_PORT with VITE_API_URL pointed at that API
 *
 * Ports come from the environment and the API really honours PORT
 * (apps/api/src/main.ts), so nothing here can drift away from the server that is
 * actually started. npm is the only package manager in this repo (ADR-0036):
 * every command below goes through npm/turbo exclusively.
 */
const API_PORT = Number(process.env.API_PORT ?? 3001);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
const API_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${API_PORT}/api/v1`;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["junit", { outputFile: "playwright-report/junit.xml" }],
      ]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Local-only project: drives the machine's installed Chrome when the
  // Playwright browser CDN is unreachable (corporate 403). CI always uses the
  // pinned `chromium`; nothing selects this project there.
  projects: process.env.E2E_PERF_CHANNEL
    ? [{ name: "chromium-system", use: { channel: process.env.E2E_PERF_CHANNEL } }]
    : undefined,
  webServer: [
    {
      command:
        "npm exec -- turbo run build --filter=@scalpai/app-api... && node apps/api/dist/main.js",
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: String(API_PORT),
        // Local E2E only: production deployments must provide their own secret.
        JWT_SECRET: process.env.JWT_SECRET ?? "l3-local-e2e-jwt-secret-not-for-production",
        STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? "mock",
      },
    },
    {
      command: `npm exec --workspace=@scalpai/app-web -- vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_URL: API_URL,
      },
    },
  ],
});
