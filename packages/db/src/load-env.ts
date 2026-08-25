import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Tiny .env loader (no dependency) — CLI entrypoints call this first. */
export function loadEnv(root = process.cwd()): void {
  const p = join(root, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
