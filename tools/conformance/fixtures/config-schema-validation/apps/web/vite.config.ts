/**
 * M14a fixture (ADR-0037): a Vite config with no `build.manifest`, so the M15
 * bundle budget has no manifest to measure the initial payload from.
 *
 * Deliberately import-free and plain: this file is inside `tools/`, so it is
 * still typechecked by tsconfig.repo.json and linted - it just must never
 * resolve a dependency or become a real config.
 */
export default {
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
  },
};
