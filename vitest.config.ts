import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tools/**/*.spec.ts", "packages/**/*.spec.ts", "apps/**/*.spec.ts", "apps/web/**/*.spec.tsx"],
    // Integration tests hit the real local PostgreSQL (ADR-0024)
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [
    // NestJS DI relies on decorator metadata (emitDecoratorMetadata) — esbuild can't emit it, SWC can.
    swc.vite({ module: { type: "es6" } }),
  ],
});
