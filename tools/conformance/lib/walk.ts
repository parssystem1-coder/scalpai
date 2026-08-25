import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const IGNORE = new Set(["node_modules", "dist", "coverage", ".git", ".turbo", ".opencode", "fixtures"]);

const toPosix = (p: string): string => p.split(sep).join("/");

export function listFiles(root: string, rel: string, exts: string[]): string[] {
  const base = join(root, rel);
  const out: string[] = [];
  if (!exists(base)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (IGNORE.has(e)) continue;
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (exts.some((x) => e.endsWith(x))) out.push(toPosix(relative(root, full)));
    }
  };
  walk(base);
  return out.sort();
}

function exists(p: string): boolean {
  try { statSync(p); return true; } catch { return false; }
}

export function readRoot(root: string, relPosix: string): string {
  return readFileSync(join(root, relPosix), "utf8");
}
