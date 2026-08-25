import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Tiny .env loader (no dependency) — CLI entrypoints call this first.
 * Walks up from cwd so it also works when spawned from a workspace
 * subdirectory (e.g. `pnpm --filter ... exec node dist/main.js`).
 */
export function loadEnv(root = process.cwd()): void {
  let dir = root;
  for (;;) {
    const p = join(dir, ".env");
    if (existsSync(p)) {
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
