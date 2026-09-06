import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Tests execute package SOURCES (not their dist builds) so coverage maps to
// src and a stale build can never mask fresh changes.
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
    },
  },
  test: {
    include: ["tools/**/*.spec.ts", "packages/**/*.spec.ts", "apps/**/*.spec.ts", "apps/web/**/*.spec.tsx"],
    // Integration tests hit the real local PostgreSQL (ADR-0024)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Multiple suites share one dev database with resetAll() — files must not race.
    fileParallelism: false,
    // Slice T4 — engineering-rules §6: coverage gate on logic packages.
    coverage: {
      provider: "v8",
      include: [
        "packages/db/src/**",
        "packages/sync-client/src/**",
        "packages/licensing/src/**",
        "packages/analysis-core/src/**",
      ],
      exclude: ["**/*.spec.ts", "**/dist/**"],
      thresholds: { lines: 70 },
    },
  },
  plugins: [
    // NestJS DI relies on decorator metadata (emitDecoratorMetadata) — esbuild can't emit it, SWC can.
    swc.vite({ module: { type: "es6" } }),
  ],
});
