import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Native binary doctor (dev-environment guard).
 *
 * npm workspaces install `@node-rs/argon2`, `@swc/core` and `sharp` with their
 * platform binaries as OPTIONAL dependencies. A stale or pruned node_modules
 * (the classic case: a repo checked out / pulled on Windows where the lockfile
 * was updated on CI/linux, or a partially-deleted tree) leaves the JS loader in
 * place while the `*-win32-x64-msvc` binary is gone. Every require() then dies
 * with "Cannot find module './argon2.win32-x64-msvc.node'" — at test time, far
 * from the cause.
 *
 * This doctor probes each consumer the way Node actually resolves (a real
 * require() in a fresh child process rooted at the consumer — fresh because a
 * CJS loader that threw once stays poisoned in require.cache) and classifies
 * the failure into loader-missing (→ `npm ci`) vs binding-missing (→ one
 * root-level install of the pinned platform packages). Run after every pull:
 *
 *   npm run env:native        # check
 *   npm run env:native -- --fix   # repair in place where safe
 *
 * Exit 0 = green, 1 = at least one error-level finding.
 */

export interface NativeEntry {
  /** npm package probed with require(). */
  readonly pkg: string;
  /** Workspace-relative consumers that must be able to load it ("." = repo root). */
  readonly consumers: readonly string[];
  /** Platform binary package names for (os, arch), any one of which satisfies the check. */
  readonly platformPkg: (os: string, arch: string) => readonly string[];
  /** Transitive tooling: report as warn instead of fail. */
  readonly warnOnly?: boolean;
}

/**
 * napi-rs layout (node-rs, @swc/core): win32 suffixed `-msvc`, linux split
 * gnu/musl, darwin bare.
 */
export function napiPlatformPkgs(base: string, os: string, arch: string): readonly string[] {
  if (os === "win32") return [`${base}-win32-${arch}-msvc`];
  if (os === "linux") return [`${base}-linux-${arch}-gnu`, `${base}-linux-${arch}-musl`];
  return [`${base}-${os}-${arch}`];
}

/**
 * sharp ≥0.33 `@img` layout: linux uses `linuxmusl` (no dash) for musl targets.
 */
export function imgPlatformPkgs(base: string, os: string, arch: string): readonly string[] {
  if (os === "win32") return [`${base}-win32-${arch}`];
  if (os === "linux") return [`${base}-linux-${arch}`, `${base}-linuxmusl-${arch}`];
  return [`${base}-${os}-${arch}`];
}

export const NATIVE_ENTRIES: readonly NativeEntry[] = [
  {
    pkg: "@node-rs/argon2",
    consumers: ["apps/api", "packages/db"],
    platformPkg: (os, arch) => napiPlatformPkgs("@node-rs/argon2", os, arch),
  },
  {
    pkg: "@swc/core",
    consumers: ["."],
    platformPkg: (os, arch) => napiPlatformPkgs("@swc/core", os, arch),
  },
  {
    pkg: "sharp",
    consumers: ["apps/api", "packages/analysis-core", "packages/db"],
    platformPkg: (os, arch) => imgPlatformPkgs("@img/sharp", os, arch),
  },
  {
    // Transitive dev tooling (tsx/vite chain) — missing binary is annoying, not blocking.
    pkg: "esbuild",
    consumers: ["."],
    platformPkg: (os, arch) => [`@esbuild/${os}-${arch}`],
    warnOnly: true,
  },
];

export type NativeFindingLevel = "error" | "warn";

export interface NativeFinding {
  readonly entry: string;
  readonly consumer: string;
  /** loader-missing: the JS package itself is not installed. binding-missing: it is, but require() dies. */
  readonly kind: "loader-missing" | "binding-missing";
  readonly level: NativeFindingLevel;
  readonly detail: string;
  /** binding-missing findings only: the exact platform packages that satisfy it. */
  readonly platforms?: readonly string[];
}

/** "error" if any error finding, else "warn" if any warn, else "ok". */
export function worstLevel(findings: readonly NativeFinding[]): "error" | "warn" | "ok" {
  if (findings.some((f) => f.level === "error")) return "error";
  if (findings.some((f) => f.level === "warn")) return "warn";
  return "ok";
}

/**
 * require() must run in a FRESH child process. A CJS module that throws during
 * evaluation stays poisoned in require.cache — every later require() of the
 * same file re-throws the cached error even after the underlying files are
 * fixed, so an in-process probe would report failures forever while every
 * fresh process (vitest, the server) loads fine. Each probe = one `node -e`.
 */
function probeRequire(consumerDir: string, pkg: string): { ok: true } | { ok: false; detail: string } {
  const script =
    `try { require(${JSON.stringify(pkg)}); process.exit(0); } ` +
    `catch (err) { process.stdout.write(String(err && err.message ? err.message : err).split("\\n")[0]); process.exit(3); }`;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: consumerDir, encoding: "utf8", timeout: 60_000 });
  if (result.status === 0) return { ok: true };
  const detail = (result.stdout ?? "").trim() || `node -e exited with ${result.status ?? "signal"}`;
  return { ok: false, detail };
}

/**
 * Probe one consumer for one entry. The probe is authoritative: it is exactly
 * what vitest/tsc/the server will do, so a passing probe needs no further
 * diagnosis (a platform-directory heuristic only produced false positives —
 * e.g. @img/sharp-linux-x64 ships a `colour` subpackage that survives prunes).
 * On failure the loader's own directory decides the repair path:
 *   - loader dir gone     → the install tree is incomplete → `npm ci`
 *   - loader dir present  → its platform binary is missing → root install
 *     (the loader throws "Cannot find native binding" long before Node reports
 *     a missing module, so the probe error text alone cannot tell these apart)
 */
export function checkEntry(
  entry: NativeEntry,
  root: string,
  os: string,
  arch: string,
): NativeFinding[] {
  return entry.consumers.flatMap((consumer) => checkConsumer(entry, consumer, root, os, arch));
}

function packageDir(root: string, consumer: string, name: string): string {
  const consumerDir = resolve(root, consumer);
  return join(consumerDir, "node_modules", ...name.split("/"));
}

function checkConsumer(entry: NativeEntry, consumer: string, root: string, os: string, arch: string): NativeFinding[] {
  const level: NativeFindingLevel = entry.warnOnly ? "warn" : "error";
  const platformNames = entry.platformPkg(os, arch);

  const probe = probeRequire(resolve(root, consumer), entry.pkg);
  if (probe.ok) return [];
  const detail = probe.detail;
  const loaderInstalled = existsSync(packageDir(root, consumer, entry.pkg)) || existsSync(join(root, "node_modules", ...entry.pkg.split("/")));
  if (!loaderInstalled) {
    return [{ entry: entry.pkg, consumer, kind: "loader-missing", level, detail: `require("${entry.pkg}") failed: ${detail}` }];
  }
  return [{
    entry: entry.pkg,
    consumer,
    kind: "binding-missing",
    level,
    detail: `require("${entry.pkg}") failed: ${detail}`,
    platforms: platformNames,
  }];
}

export function checkNativeDeps(
  root: string,
  os: string = process.platform,
  arch: string = process.arch,
): NativeFinding[] {
  return NATIVE_ENTRIES.flatMap((entry) => checkEntry(entry, root, os, arch));
}

/**
 * Repair decision, from what actually happened on this repo (npm 11 + workspaces):
 *
 * - Platform-binary findings only: ONE root-level `npm install --no-save` of the
 *   missing platform packages heals every consumer at once (require falls up to
 *   the hoisted root node_modules). Serial per-workspace installs do NOT work:
 *   each one prunes the previous install's extras (npm/cli#4828 prune wars).
 * - Any probe finding (the loader itself is gone): the workspace install tree is
 *   incomplete — patching it with --no-save installs is what started the prune
 *   wars. The honest repair is one `npm ci` from the lockfile.
 */
export type FixPlan =
  | { readonly mode: "ci" }
  | { readonly mode: "install"; readonly packages: readonly string[] }
  | { readonly mode: "none" };

export function fixPlan(findings: readonly NativeFinding[]): FixPlan {
  const errors = findings.filter((f) => f.level === "error");
  if (errors.length === 0) return { mode: "none" };
  if (errors.some((f) => f.kind === "loader-missing")) return { mode: "ci" };
  return { mode: "install", packages: [...new Set(errors.flatMap((f) => f.platforms ?? []))] };
}

/**
 * Pin a platform package to the version the lockfile carries. Platform
 * releases version-bump separately from their loader (sharp 0.35.3 wants
 * @img/sharp-win32-x64 0.35.4), so an unpinned install can mismatch. The
 * entry is usually NOT a top-level `node_modules/<name>` package (this repo's
 * linux-generated lock has no win32 package entries at all) — but every
 * consumer entry lists it in its optionalDependencies map.
 */
export function pinFromLock(root: string, name: string): string {
  try {
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
      packages?: Record<string, { version?: string; optionalDependencies?: Record<string, string>; dependencies?: Record<string, string> }>;
    };
    const packages = lock.packages ?? {};
    const direct = packages[`node_modules/${name}`]?.version;
    if (direct) return `${name}@${direct}`;
    for (const [key, entry] of Object.entries(packages)) {
      if (key.endsWith(`/node_modules/${name}`) && entry.version) return `${name}@${entry.version}`;
      const version = entry.optionalDependencies?.[name] ?? entry.dependencies?.[name];
      if (version) return `${name}@${version}`;
    }
  } catch {
    // no/unreadable lock — fall through to unpinned
  }
  return name;
}

/**
 * The install path only ADDS packages, so it is safe to run in-process.
 * `npm ci` deletes node_modules — including the tsx runtime this tool is
 * executing from — which on Windows kills both processes (files are locked
 * while running). So the ci path instructs and exits instead.
 *
 * The install path ACCUMULATES: on npm ≥11 a `npm install --no-save X` can
 * prune previously hand-installed extras (the prune war behind npm/cli#4828),
 * so fixing sharp can break argon2. Re-checking after each install and always
 * installing the accumulated union together converges. Two field facts shape
 * the loop: pruning of extras is INCONSISTENT (same-shaped installs sometimes
 * prune, sometimes not — never assume one round suffices), and freshly written
 * .node binaries can transiently fail require() under Windows AV scanning, so
 * every post-install check gets a settling grace period before it is believed.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A failing require() right after an install is retried with patience: on
 * Windows the AV scans and locks freshly written multi-MB .node files, and a
 * require() racing that scan fails even though the files are fine seconds
 * later. Every retry probes in a fresh child, so nothing is cached-poisoned.
 */
async function checkStable(root: string, attempts = 4): Promise<NativeFinding[]> {
  let findings = checkNativeDeps(root);
  for (let attempt = 1; attempt < attempts && findings.some((f) => f.level === "error"); attempt++) {
    await sleep(2_000);
    findings = checkNativeDeps(root);
  }
  return findings;
}

/**
 * Drive installs until healthy. Never emits the final verdict itself — main()
 * re-checks patiently after the loop, because a freshly installed binary can
 * stay un-requireable for several seconds while the AV finishes with it.
 */
async function runFixes(root: string): Promise<void> {
  const wanted = new Set<string>();
  for (let round = 0; round < 6; round++) {
    const errors = (await checkStable(root)).filter((f) => f.level === "error");
    if (errors.length === 0) return;
    const plan = fixPlan(errors);
    if (plan.mode === "none") return;
    if (plan.mode === "ci") {
      console.error("[fix] a native package loader itself is missing — the install tree is incomplete (npm/cli#4828).");
      console.error("[fix] run `npm ci` manually (this tool cannot run it: it lives inside the node_modules it would delete), then re-run `npm run env:native`.");
      process.exit(1);
    }
    const fresh = plan.packages.filter((pkg) => !wanted.has(pkg));
    for (const pkg of fresh) wanted.add(pkg);
    if (fresh.length === 0) {
      // Union already installed: give the tree time to settle (AV/prune lag).
      await sleep(5_000);
      continue;
    }
    const pinned = [...wanted].map((name) => pinFromLock(resolve(root), name));
    console.log(`[fix] npm install --no-save ${pinned.join(" ")}`);
    try {
      execFileSync("npm", ["install", "--no-save", ...pinned], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
    } catch (err) {
      console.error(`[fix] npm install failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      process.exit(1);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const root = args.find((arg) => !arg.startsWith("--")) ?? process.cwd();
  const wantFix = args.includes("--fix");

  let findings = checkNativeDeps(root);
  if (wantFix && findings.some((f) => f.level === "error")) {
    await runFixes(root);
    findings = await checkStable(root, 6);
  }

  console.log(`native doctor: ${process.platform} ${process.arch} node ${process.versions.node} — root ${resolve(root)}`);
  for (const entry of NATIVE_ENTRIES) {
    for (const consumer of entry.consumers) {
      const own = findings.filter((f) => f.entry === entry.pkg && f.consumer === consumer);
      const first = own[0];
      const mark = first === undefined ? "OK " : first.level === "error" ? "ERR" : "WRN";
      console.log(`  [${mark}] ${entry.pkg} (${consumer})${first === undefined ? "" : ` — ${first.kind}: ${first.detail}`}`);
    }
  }

  const worst = worstLevel(findings);
  if (worst === "ok") {
    console.log("native doctor: OK (every native dep loads with its platform binary)");
    return;
  }
  console.error(`native doctor: ${worst.toUpperCase()} (${findings.filter((f) => f.level === "error").length} error, ${findings.filter((f) => f.level === "warn").length} warn)`);
  if (worst === "error") console.error("Run `npm run env:native -- --fix` (or a fresh `npm ci`) after pulling.");
  process.exit(worst === "error" ? 1 : 0);
}

const invoked = (process.argv[1] ?? "").replaceAll("\\", "/");
if (invoked.endsWith("tools/env/native-doctor.ts")) {
  void main();
}
