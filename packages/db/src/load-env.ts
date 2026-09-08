import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Tiny .env loader (no dependency) - CLI entrypoints call this first.
 * Walks up from cwd so it also works when spawned from a workspace
 * subdirectory (e.g. `npm run start --workspace=@scalpai/app-api`).
 */
export function loadEnv(root = process.cwd()): void {
  let dir = root;
  for (;;) {
    const p = join(dir, ".env");
    if (existsSync(p)) {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (!m) continue;
        // noUncheckedIndexedAccess: the regex has exactly 2 capture groups, so
        // both are present on a match; the guard/fallback are unreachable.
        const [, key, value] = m;
        if (key === undefined) continue;
        if (!(key in process.env)) process.env[key] = value ?? "";
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
