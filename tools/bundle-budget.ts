import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

/**
 * Initial web payload budget (engineering-rules 6 / DESIGN 14.2, WEAKNESSES M15).
 *
 * The old version guessed: it summed files whose name started with `index-` and
 * called everything else lazy. That is not what a browser downloads. This
 * version reads the REAL Vite manifest and walks the STATIC import graph from
 * every entry chunk: entry + transitively statically imported chunks + their
 * CSS. `dynamicImports` are excluded - that, and only that, is what "lazy"
 * means (the 3D engine stays out of the budget as long as it is imported
 * dynamically; make it static and the budget notices immediately).
 *
 * Requires `build.manifest: true` in apps/web/vite.config.ts. A missing manifest
 * fails the gate instead of silently reporting a comfortable 0 B.
 */

export interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

export type ViteManifest = Record<string, ManifestChunk>;

export const LIMIT_BYTES = Number(process.env.BUNDLE_BUDGET_BYTES ?? 300 * 1024);

export function findManifest(distDir: string): string | null {
  for (const rel of [join(".vite", "manifest.json"), "manifest.json"]) {
    const full = join(distDir, rel);
    if (existsSync(full)) return full;
  }
  return null;
}

/** Files the browser must download before the app is interactive. */
export function initialPayload(manifest: ViteManifest): string[] {
  const payload = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    if (chunk.file) payload.add(chunk.file);
    for (const css of chunk.css ?? []) payload.add(css);
    for (const imported of chunk.imports ?? []) visit(imported);
  };

  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry) visit(key);
  }
  return [...payload].sort();
}

export interface PayloadRow {
  file: string;
  gzipBytes: number;
}

export function measure(distDir: string, files: string[]): PayloadRow[] {
  return files.map((file) => {
    const full = join(distDir, file);
    if (!existsSync(full)) return { file, gzipBytes: 0 };
    return { file, gzipBytes: gzipSync(readFileSync(full)).length };
  });
}

function main(): void {
  const distDir = process.env.WEB_DIST_DIR ?? join(process.cwd(), "apps", "web", "dist");
  const manifestPath = findManifest(distDir);
  if (!manifestPath) {
    console.error(`bundle budget: no Vite manifest under ${distDir}.`);
    console.error("Build the web app with build.manifest enabled (npm run build) before measuring.");
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ViteManifest;
  const files = initialPayload(manifest);
  if (files.length === 0) {
    console.error(`bundle budget: manifest ${manifestPath} declares no entry chunk - nothing was measured.`);
    process.exit(1);
  }

  const rows = measure(distDir, files);
  let total = 0;
  for (const row of rows) {
    total += row.gzipBytes;
    console.log(`${row.file.padEnd(44)} ${String(row.gzipBytes).padStart(8)} B gz [initial payload]`);
  }

  const lazy = Object.values(manifest)
    .flatMap((chunk) => chunk.dynamicImports ?? [])
    .filter((key) => manifest[key])
    .map((key) => manifest[key]!.file);
  for (const file of [...new Set(lazy)].sort()) {
    if (files.includes(file)) continue;
    console.log(`${file.padEnd(44)} ${"".padStart(8)}   (lazy chunk - deferred, excluded)`);
  }

  console.log(`${"-".repeat(60)}`);
  console.log(`manifest ${manifestPath}`);
  console.log(`TOTAL ${total} B gz across ${rows.length} initial file(s) / limit ${LIMIT_BYTES} B`);
  if (total > LIMIT_BYTES) {
    console.error(`BUNDLE BUDGET EXCEEDED by ${total - LIMIT_BYTES} B`);
    process.exit(1);
  }
  console.log("bundle budget: OK");
}

const invoked = (process.argv[1] ?? "").replaceAll("\\", "/");
if (invoked.endsWith("tools/bundle-budget.ts")) {
  main();
}
