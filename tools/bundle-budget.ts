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
 *
 * M15b turns that measurement into ENFORCEMENT. The hard limit no longer comes
 * from an environment variable any CI step could raise; it lives in
 * `tools/bundle-budget.policy.json`, which IS committed, so every change to the
 * ceiling shows up in a reviewable diff. Run with `--policy <file>` and the
 * policy is the only source of the limit: `BUNDLE_BUDGET_BYTES` is ignored, a
 * missing or malformed policy is fatal, a missing or unreadable report is fatal,
 * a report written against another `schemaVersion` is fatal, and an over-budget
 * payload exits 1 with the limit, the actual value and the delta.
 * `--report <file>` judges an existing report without measuring, which is how
 * the regression suite proves the failure path without running a real build.
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

/**
 * Fallback limit for a run WITHOUT `--policy`: local exploration and the local
 * failure-path experiments the playbook allows. Deliberately no longer the CI
 * contract - see `--policy`.
 */
export const LIMIT_BYTES = Number(process.env.BUNDLE_BUDGET_BYTES ?? 300 * 1024);

/**
 * Version of the JSON report contract (M15a). M15b's policy file declares the
 * same field and a mismatch is an error, so this number only moves when the
 * shape below changes in a way a consumer must notice.
 */
export const REPORT_SCHEMA_VERSION = 1;

/** Default report name, written inside the dist directory - an artifact. */
export const REPORT_FILENAME = "bundle-budget.report.json";

/** The committed policy the CI gate is required to run against (M15b). */
export const POLICY_PATH = "tools/bundle-budget.policy.json";

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

/* -------------------------------------------------------------------------- */
/* M15b - the committed policy, and enforcement against it                     */
/* -------------------------------------------------------------------------- */

/**
 * One error type for every "this gate cannot be trusted" condition: unreadable
 * policy, unreadable report, nonsense values, bad CLI usage. `main` turns it
 * into `exit 1`, which is the entire point - none of these may degrade into a
 * comfortable default.
 */
export class PolicyError extends Error {}

/** Same rule as tools/conformance/exceptions.json: an exception needs an ADR. */
const ADR_REF = /^ADR-\d{3,4}$/;

export interface PolicyException {
  file?: string;
  adr: string;
  reason?: string;
}

export interface BundleBudgetPolicy {
  schemaVersion: number;
  budget: {
    /** Hard limit, in gzip bytes, for the initial payload. */
    initialGzipBytes: number;
    /** Ratio of the limit above which the run warns without failing. */
    warningThreshold: number;
  };
  exceptions: PolicyException[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePolicy(raw: string, source: string): BundleBudgetPolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new PolicyError(`policy ${source} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isRecord(parsed)) throw new PolicyError(`policy ${source} must contain a JSON object.`);

  const { schemaVersion, budget, exceptions } = parsed;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new PolicyError(`policy ${source}: schemaVersion must be a positive integer.`);
  }
  if (!isRecord(budget)) throw new PolicyError(`policy ${source}: budget must be an object.`);

  const { initialGzipBytes, warningThreshold } = budget;
  if (typeof initialGzipBytes !== "number" || !Number.isInteger(initialGzipBytes) || initialGzipBytes <= 0) {
    throw new PolicyError(`policy ${source}: budget.initialGzipBytes must be a positive integer number of bytes.`);
  }
  if (
    typeof warningThreshold !== "number" ||
    !Number.isFinite(warningThreshold) ||
    warningThreshold <= 0 ||
    warningThreshold > 1
  ) {
    throw new PolicyError(`policy ${source}: budget.warningThreshold must be a ratio above 0 and at most 1.`);
  }
  if (!Array.isArray(exceptions)) {
    throw new PolicyError(`policy ${source}: exceptions must be an array (use [] when there are none).`);
  }

  const parsedExceptions = exceptions.map((entry: unknown, index: number): PolicyException => {
    if (!isRecord(entry)) throw new PolicyError(`policy ${source}: exceptions[${index}] must be an object.`);
    const { adr, file, reason } = entry;
    if (typeof adr !== "string" || !ADR_REF.test(adr)) {
      throw new PolicyError(
        `policy ${source}: exceptions[${index}] needs an ADR reference (e.g. "ADR-0037"), same rule as tools/conformance/exceptions.json.`,
      );
    }
    const out: PolicyException = { adr };
    if (typeof file === "string") out.file = file;
    if (typeof reason === "string") out.reason = reason;
    return out;
  });

  return {
    schemaVersion,
    budget: { initialGzipBytes, warningThreshold },
    exceptions: parsedExceptions,
  };
}

export function loadPolicy(path: string): BundleBudgetPolicy {
  if (!existsSync(path)) {
    throw new PolicyError(
      `policy ${path} does not exist - the committed policy is the only source of the hard limit, so there is nothing to enforce.`,
    );
  }
  return parsePolicy(readFileSync(path, "utf8"), path);
}

/** The part of an M15a report that enforcement needs, validated. */
export interface MeasuredReport {
  schemaVersion: number;
  totalGzipBytes: number;
  files: PayloadRow[];
}

export function parseMeasuredReport(raw: string, source: string): MeasuredReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new PolicyError(`report ${source} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isRecord(parsed)) throw new PolicyError(`report ${source} must contain a JSON object.`);

  const { schemaVersion, totalGzipBytes, initialPayload: payload } = parsed;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new PolicyError(`report ${source}: schemaVersion must be a positive integer.`);
  }
  if (typeof totalGzipBytes !== "number" || !Number.isInteger(totalGzipBytes) || totalGzipBytes < 0) {
    throw new PolicyError(
      `report ${source}: totalGzipBytes must be a non-negative integer - a measurement error must fail, not read as zero.`,
    );
  }
  if (!isRecord(payload) || !Array.isArray(payload.files)) {
    throw new PolicyError(`report ${source}: initialPayload.files must be an array of measured files.`);
  }

  const files = payload.files.map((entry: unknown, index: number): PayloadRow => {
    if (!isRecord(entry)) throw new PolicyError(`report ${source}: initialPayload.files[${index}] must be an object.`);
    const { file, gzipBytes } = entry;
    if (typeof file !== "string" || typeof gzipBytes !== "number" || !Number.isFinite(gzipBytes)) {
      throw new PolicyError(`report ${source}: initialPayload.files[${index}] needs a file name and a gzipBytes size.`);
    }
    return { file, gzipBytes };
  });

  return { schemaVersion, totalGzipBytes, files };
}

export function loadMeasuredReport(path: string): MeasuredReport {
  if (!existsSync(path)) {
    throw new PolicyError(
      `report ${path} does not exist - the budget cannot be enforced without a measurement (build first).`,
    );
  }
  return parseMeasuredReport(readFileSync(path, "utf8"), path);
}

export type EnforcementLevel = "ok" | "warning" | "exceeded" | "error";

export interface Enforcement {
  ok: boolean;
  level: EnforcementLevel;
  limitBytes: number;
  actualBytes: number;
  /** actual - limit. Negative is the remaining headroom, which is what a ratchet decision needs. */
  deltaBytes: number;
  warningBytes: number;
  /** The contract line every failure and every success prints. */
  summary: string;
  messages: string[];
}

/** The biggest initial-payload files, so a failure names the culprit. */
export function topOffenders(files: readonly PayloadRow[], count = 5): PayloadRow[] {
  return [...files].sort((a, b) => b.gzipBytes - a.gzipBytes || (a.file < b.file ? -1 : 1)).slice(0, count);
}

/** Pure: the whole verdict, with no I/O and no process exit. */
export function enforcePolicy(policy: BundleBudgetPolicy, report: MeasuredReport): Enforcement {
  const limitBytes = policy.budget.initialGzipBytes;
  const actualBytes = report.totalGzipBytes;
  const deltaBytes = actualBytes - limitBytes;
  const warningBytes = Math.floor(limitBytes * policy.budget.warningThreshold);
  const summary = `limit: ${limitBytes}, actual: ${actualBytes}, delta: ${deltaBytes}`;
  const base = { limitBytes, actualBytes, deltaBytes, warningBytes, summary };

  if (report.schemaVersion !== policy.schemaVersion) {
    return {
      ...base,
      ok: false,
      level: "error",
      messages: [
        `BUNDLE BUDGET CONTRACT MISMATCH - report schemaVersion ${report.schemaVersion} != policy schemaVersion ${policy.schemaVersion}.`,
        "Regenerate the report with the current tool, or bump the policy deliberately in a reviewed diff.",
        summary,
      ],
    };
  }

  if (deltaBytes > 0) {
    return {
      ...base,
      ok: false,
      level: "exceeded",
      messages: [
        `BUNDLE BUDGET EXCEEDED - ${summary}`,
        `over the committed limit by ${deltaBytes} B gz.`,
        "largest initial-payload files:",
        ...topOffenders(report.files).map(
          (row) => `  ${row.file.padEnd(44)} ${String(row.gzipBytes).padStart(8)} B gz`,
        ),
      ],
    };
  }

  const headroom = -deltaBytes;
  if (actualBytes > warningBytes) {
    return {
      ...base,
      ok: true,
      level: "warning",
      messages: [
        `bundle budget WARNING: above ${policy.budget.warningThreshold * 100}% of the committed limit - ${summary}`,
        `${headroom} B gz of headroom left.`,
      ],
    };
  }

  return {
    ...base,
    ok: true,
    level: "ok",
    messages: [`bundle budget: within the committed policy - ${summary}`, `${headroom} B gz of headroom left.`],
  };
}

export interface CliOptions {
  /** Enforce the committed policy at this path. Null keeps the pre-M15b env behaviour. */
  policyPath: string | null;
  /** Judge this existing report instead of measuring a build. Requires a policy. */
  reportPath: string | null;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const usage = "usage: bundle-budget.ts [--policy <file>] [--report <file>]";
  let policyPath: string | null = null;
  let reportPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const eq = arg.indexOf("=");
    const inline = arg.startsWith("--") && eq !== -1;
    const flag = inline ? arg.slice(0, eq) : arg;
    let value = inline ? arg.slice(eq + 1) : null;

    if (flag !== "--policy" && flag !== "--report") {
      throw new PolicyError(`unknown argument ${arg}. ${usage}`);
    }
    if (value === null) {
      value = argv[index + 1] ?? null;
      index += 1;
    }
    if (value === null || value.length === 0 || value.startsWith("--")) {
      throw new PolicyError(`${flag} needs a file path. ${usage}`);
    }
    if (flag === "--policy") policyPath = value;
    else reportPath = value;
  }

  return { policyPath, reportPath };
}

function fail(message: string): never {
  console.error(`bundle budget: ${message}`);
  process.exit(1);
}

/** Turns a PolicyError into `exit 1`; anything else is a real bug and propagates. */
function attempt<T>(run: () => T): T {
  try {
    return run();
  } catch (err) {
    if (err instanceof PolicyError) fail(err.message);
    throw err;
  }
}

function announce(result: Enforcement): void {
  for (const line of result.messages) {
    if (result.ok) console.log(line);
    else console.error(line);
  }
  if (!result.ok) process.exit(1);
}

function main(): void {
  const { policyPath, reportPath } = attempt(() => parseCliArgs(process.argv.slice(2)));

  if (policyPath !== null && (process.env.BUNDLE_BUDGET_BYTES ?? "") !== "") {
    // The entire reason M15b exists: no environment variable may raise the
    // ceiling once a committed policy is in play.
    console.log("bundle budget: ignoring BUNDLE_BUDGET_BYTES - the committed policy owns the limit.");
  }

  // Enforcement-only mode: judge a report that already exists. No build, no
  // measurement, no write - this is the mode the regression suite drives.
  if (reportPath !== null) {
    if (policyPath === null) {
      fail("--report needs --policy: a report on its own has no limit to be judged against.");
    }
    const policy = attempt(() => loadPolicy(policyPath));
    const measured = attempt(() => loadMeasuredReport(reportPath));
    console.log(`policy ${policyPath} (schemaVersion ${policy.schemaVersion})`);
    console.log(`report ${reportPath} (schemaVersion ${measured.schemaVersion})`);
    announce(enforcePolicy(policy, measured));
    console.log("bundle budget: OK (enforced from the committed policy)");
    return;
  }

  const policy = policyPath === null ? null : attempt(() => loadPolicy(policyPath));
  const limitBytes = policy === null ? LIMIT_BYTES : policy.budget.initialGzipBytes;

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
    limitBytes,
    rows: measure(distDir, files),
    lazyChunks: lazyChunkFiles(manifest, files),
  });

  for (const row of report.initialPayload.files) {
    console.log(`${row.file.padEnd(44)} ${String(row.gzipBytes).padStart(8)} B gz [initial payload]`);
  }
  for (const file of report.lazyChunks) {
    console.log(`${file.padEnd(44)} ${"".padStart(8)}   (lazy chunk - deferred, excluded)`);
  }

  const writtenPath = resolveReportPath(distDir);
  writeReport(writtenPath, report);

  console.log(`${"-".repeat(60)}`);
  console.log(`manifest ${manifestPath}`);
  console.log(`report ${writtenPath} (schemaVersion ${report.schemaVersion}, artifact - not committed)`);
  console.log(
    `TOTAL ${report.totalGzipBytes} B gz across ${report.initialPayload.fileCount} initial file(s) / limit ${report.limitBytes} B`,
  );

  if (policy !== null) {
    // Read the artifact back from disk: this gate is only as good as the report
    // it can actually load, so a report that failed to land is a red build.
    const measured = attempt(() => loadMeasuredReport(writtenPath));
    console.log(`policy ${policyPath} (schemaVersion ${policy.schemaVersion})`);
    announce(enforcePolicy(policy, measured));
    console.log("bundle budget: OK (enforced from the committed policy)");
    return;
  }

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
