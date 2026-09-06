import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Tests execute package SOURCES (not their dist builds) so coverage maps to
// src and a stale build can never mask fresh changes. Every workspace package
// whose package.json resolves to dist/ (production correctness) needs an alias
// here, otherwise the suite would need a build first.
const pkgSrc = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));
const pkgFile = (path: string) => fileURLToPath(new URL(`./packages/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // The subpath alias MUST come first: alias matching is prefix-based.
      "@scalpai/db/testing": pkgFile("db/src/testing.ts"),
      "@scalpai/db": pkgSrc("db"),
      "@scalpai/shared": pkgSrc("shared"),
      "@scalpai/sync-client": pkgSrc("sync-client"),
      "@scalpai/analysis-core": pkgSrc("analysis-core"),
    },
  },
  test: {
    include: ["tools/**/*.spec.ts", "packages/**/*.spec.ts", "apps/**/*.spec.ts", "apps/web/**/*.spec.tsx"],
    // Integration tests hit the real local PostgreSQL (ADR-0024)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Multiple suites share one dev database with resetAll() - files must not race.
    fileParallelism: false,
    /**
     * Coverage (WEAKNESSES H14). "70% of the logic packages" was never enough:
     * the API and the web paths that carry auth, transport and offline
     * correctness are measured too. The API/web floors are a RATCHET - raise
     * them as suites grow, never lower them to make a red build green.
     *
     * Excluded on purpose: the API bootstrap and Nest DI modules, whose real
     * proof is the deployment job booting the stack from an empty database, not
     * a unit test importing them.
     */
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "packages/db/src/**",
        "packages/sync-client/src/**",
        "packages/licensing/src/**",
        "packages/analysis-core/src/**",
        "apps/api/src/**",
        "apps/web/src/api/**",
        "apps/web/src/context/**",
        "apps/web/src/offline/**",
      ],
      exclude: [
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/dist/**",
        "**/*.d.ts",
        "apps/api/src/main.ts",
        "**/*.module.ts",
      ],
      thresholds: {
        "packages/{db,sync-client,licensing,analysis-core}/src/**": { lines: 70 },
        "apps/api/src/**": { lines: 40 },
        "apps/web/src/{api,context,offline}/**": { lines: 40 },
      },
    },
  },
  plugins: [
    // NestJS DI relies on decorator metadata (emitDecoratorMetadata) - esbuild can't emit it, SWC can.
    swc.vite({ module: { type: "es6" } }),
  ],
});
