import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

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
 *
 * M15a adds one thing on top of that graph analysis, which is left untouched:
 * the same numbers are also published as a structured JSON report, so M15b can
 * apply a versioned policy to them and a reviewer can diff two builds. The
 * report carries no timestamp and no local path - `manifest` is recorded
 * relative to the dist directory - so two runs against the same build are
 * byte-identical. It is written inside the build output (`dist/` is gitignored)
 * because it is an artifact, not a committed file.
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

/**
 * Version of the JSON report contract (M15a). M15b's policy file declares the
 * same field and a mismatch is an error, so this number only moves when the
 * shape below changes in a way a consumer must notice.
 */
export const REPORT_SCHEMA_VERSION = 1;

/** Default report name, written inside the dist directory - an artifact. */
export const REPORT_FILENAME = "bundle-budget.report.json";

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

/**
 * Chunks reached only through `dynamicImports`: deferred, so outside the initial
 * payload. Reported for visibility, never counted. De-duplicated and sorted, so
 * the list is stable across runs. Same selection the text report already made -
 * it now has one implementation instead of two.
 */
export function lazyChunkFiles(manifest: ViteManifest, initialFiles: string[]): string[] {
  const lazy = Object.values(manifest)
    .flatMap((chunk) => chunk.dynamicImports ?? [])
    .filter((key) => manifest[key])
    .map((key) => manifest[key]!.file);
  return [...new Set(lazy)].sort().filter((file) => !initialFiles.includes(file));
}

export interface BundleBudgetReport {
  schemaVersion: number;
  tool: string;
  /** Manifest location relative to the dist directory - never an absolute path. */
  manifest: string;
  limitBytes: number;
  totalGzipBytes: number;
  /** total - limit. Negative is the headroom left, which is what makes a ratchet decidable. */
  deltaBytes: number;
  withinBudget: boolean;
  initialPayload: {
    fileCount: number;
    files: PayloadRow[];
  };
  lazyChunks: string[];
}

/** Pure: same inputs, same report. No clock, no I/O, no environment. */
export function buildReport(input: {
  manifest: string;
  limitBytes: number;
  rows: PayloadRow[];
  lazyChunks: string[];
}): BundleBudgetReport {
  const totalGzipBytes = input.rows.reduce((sum, row) => sum + row.gzipBytes, 0);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: "tools/bundle-budget.ts",
    manifest: input.manifest,
    limitBytes: input.limitBytes,
    totalGzipBytes,
    deltaBytes: totalGzipBytes - input.limitBytes,
    withinBudget: totalGzipBytes <= input.limitBytes,
    initialPayload: {
      fileCount: input.rows.length,
      files: input.rows.map((row) => ({ file: row.file, gzipBytes: row.gzipBytes })),
    },
    lazyChunks: [...input.lazyChunks],
  };
}

export function serializeReport(report: BundleBudgetReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Manifest keys and `file` values are POSIX; make a measured path agree on Windows too. */
export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function resolveReportPath(distDir: string): string {
  const override = process.env.BUNDLE_BUDGET_REPORT;
  if (override && override.length > 0) {
    return isAbsolute(override) ? override : join(process.cwd(), override);
  }
  return join(distDir, REPORT_FILENAME);
}

export function writeReport(path: string, report: BundleBudgetReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeReport(report), "utf8");
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

  // One measurement feeds both outputs, so the printed total and the JSON total
  // cannot drift apart.
  const report = buildReport({
    manifest: toPosix(relative(distDir, manifestPath)),
    limitBytes: LIMIT_BYTES,
    rows: measure(distDir, files),
    lazyChunks: lazyChunkFiles(manifest, files),
  });

  for (const row of report.initialPayload.files) {
    console.log(`${row.file.padEnd(44)} ${String(row.gzipBytes).padStart(8)} B gz [initial payload]`);
  }
  for (const file of report.lazyChunks) {
    console.log(`${file.padEnd(44)} ${"".padStart(8)}   (lazy chunk - deferred, excluded)`);
  }

  const reportPath = resolveReportPath(distDir);
  writeReport(reportPath, report);

  console.log(`${"-".repeat(60)}`);
  console.log(`manifest ${manifestPath}`);
  console.log(`report ${reportPath} (schemaVersion ${report.schemaVersion}, artifact - not committed)`);
  console.log(
    `TOTAL ${report.totalGzipBytes} B gz across ${report.initialPayload.fileCount} initial file(s) / limit ${report.limitBytes} B`,
  );
  if (!report.withinBudget) {
    console.error(`BUNDLE BUDGET EXCEEDED by ${report.deltaBytes} B`);
    process.exit(1);
  }
  console.log("bundle budget: OK");
}

const invoked = (process.argv[1] ?? "").replaceAll("\\", "/");
if (invoked.endsWith("tools/bundle-budget.ts")) {
  main();
}
