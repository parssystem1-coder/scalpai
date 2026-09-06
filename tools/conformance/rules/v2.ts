import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, Violation } from "../lib/types.js";
import { listFiles, readRoot } from "../lib/walk.js";

/**
 * Phase 5 rule set (WEAKNESSES M14, ADR-0037). Three failure modes that kept
 * slipping past review because nothing mechanically looked for them:
 *
 *   1. package-call-site  - a workspace package nobody imports (M4/M16 debt).
 *   2. production-mocks   - SAMPLE_/MOCK_/Mocked data on a production path with
 *                           no environment gate (M1/M2).
 *   3. package-manager    - a pnpm/yarn invocation in an npm repository (H15).
 *
 * Prose lives in docs/: this file only covers EXECUTABLE surfaces, because the
 * remaining pnpm snippets in docs/playbooks are explicitly phase 10 doc-drift
 * work (ADR-0036).
 */

const TS_EXTS = [".ts", ".tsx"];

function existsRoot(root: string, rel: string): boolean {
  try {
    statSync(join(root, rel));
    return true;
  } catch {
    return false;
  }
}

interface WorkspacePackage {
  name: string;
  dir: string;
}

function workspacePackages(root: string): WorkspacePackage[] {
  const base = join(root, "packages");
  if (!existsSync(base)) return [];
  const out: WorkspacePackage[] = [];
  for (const entry of readdirSync(base)) {
    const dir = join(base, entry);
    if (!statSync(dir).isDirectory()) continue;
    const manifest = join(dir, "package.json");
    if (!existsSync(manifest)) continue;
    let name: string | undefined;
    try {
      name = (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name;
    } catch {
      name = undefined;
    }
    if (name) out.push({ name, dir: `packages/${entry}` });
  }
  return out;
}

function dependsOn(root: string, manifestRel: string, packageName: string): boolean {
  let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
  try {
    parsed = JSON.parse(readRoot(root, manifestRel)) as typeof parsed;
  } catch {
    return false;
  }
  for (const section of [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]) {
    if (section && packageName in section) return true;
  }
  return false;
}

/**
 * M14/M4 - a package with no call-site is either dead weight or an unfinished
 * scaffold. A call-site is an import from outside the package itself, or a
 * dependency declaration in another workspace manifest. Keeping it must be a
 * decision with an ADR, not an oversight.
 */
export const packageCallSite: Rule = {
  name: "package-call-site",
  source: "14.3 (M14/M4)",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const packages = workspacePackages(ctx.root);
    if (packages.length === 0) return out;

    const sources = [
      ...listFiles(ctx.root, "apps", TS_EXTS),
      ...listFiles(ctx.root, "packages", TS_EXTS),
      ...listFiles(ctx.root, "tools", [".ts"]),
      ...listFiles(ctx.root, "e2e", [".ts"]),
    ];
    const manifests = [
      ...listFiles(ctx.root, "apps", ["package.json"]),
      ...listFiles(ctx.root, "packages", ["package.json"]),
      ...listFiles(ctx.root, "tools", ["package.json"]),
    ];

    for (const pkg of packages) {
      const importedFrom = sources.filter((f) => {
        if (f === `${pkg.dir}/package.json` || f.startsWith(`${pkg.dir}/`)) return false;
        const src = readRoot(ctx.root, f);
        const escaped = pkg.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`from\\s+["']${escaped}(?:/[^"']*)?["']|import\\(\\s*["']${escaped}`).test(src);
      });
      if (importedFrom.length > 0) continue;

      const dependents = manifests.filter((m) => !m.startsWith(`${pkg.dir}/`) && dependsOn(ctx.root, m, pkg.name));
      if (dependents.length > 0) continue;

      out.push({
        rule: this.name,
        file: `${pkg.dir}/package.json`,
        message: `package '${pkg.name}' hich call-site nadarad (no import, no dependent manifest)`,
        fix: "either wire it into a real call-site, delete it, or register it in exceptions.json with an ADR",
      });
    }
    return out;
  },
};

/**
 * M14/M1/M2 - demo payloads must not sit on a production render path without an
 * explicit environment gate. A file counts as gated when it checks one of the
 * known switches; anything else has to be registered with an ADR.
 */
const MOCK_MARKERS: { rule: string; re: RegExp }[] = [
  { rule: "SAMPLE_ constant", re: /\bSAMPLE_[A-Z0-9_]+\b/ },
  { rule: "MOCK_ constant", re: /\bMOCK_[A-Z0-9_]+\b/ },
  { rule: "Mocked marker", re: /\bMocked\b/ },
  { rule: "mockData", re: /\bmockData\b/ },
];

const GATE_MARKERS: RegExp[] = [
  /import\.meta\.env\.DEV/,
  /process\.env\.NODE_ENV/,
  /isProduction\(/,
  /STORAGE_DRIVER/,
  /isMockStorageEnabled/,
  /isMockPerf\(/,
];

export const productionMocks: Rule = {
  name: "production-mocks",
  source: "14.3 (M14/M1/M2)",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const scope of ["apps", "packages"]) {
      for (const f of listFiles(ctx.root, scope, TS_EXTS)) {
        if (f.endsWith(".spec.ts") || f.endsWith(".spec.tsx")) continue;
        if (/(^|\/)(test|__tests__|testing)\//.test(f)) continue;
        const src = readRoot(ctx.root, f);
        if (GATE_MARKERS.some((re) => re.test(src))) continue;
        const lines = src.split("\n");
        const hit = lines.findIndex((line) => MOCK_MARKERS.some(({ re }) => re.test(line)));
        if (hit === -1) continue;
        const marker = MOCK_MARKERS.find(({ re }) => re.test(lines[hit]!))!;
        out.push({
          rule: this.name,
          file: `${f}:${hit + 1}`,
          message: `${marker.rule} dar masir production bedoone gate mohiti`,
          fix: "gate it behind import.meta.env.DEV / a driver switch, move it to a fixture, or register it with an ADR",
        });
      }
    }
    return out;
  },
};

/**
 * H15 - npm is the only package manager (ADR-0036). Docs are deliberately out of
 * scope: the leftover snippets in docs/playbooks are phase 10 doc-drift work.
 */
const PM_INVOCATION: { rule: string; re: RegExp }[] = [
  { rule: "pnpm invocation", re: /\bpnpm\s+[a-z@-]/ },
  { rule: "pnpm packageManager", re: /"packageManager"\s*:\s*"pnpm/ },
  { rule: "yarn invocation", re: /\byarn\s+(?:run|install|add|remove|why|workspace|dlx)\b/ },
];

const PM_ROOT_FILES = [
  "package.json",
  "playwright.config.ts",
  "vitest.config.ts",
  "turbo.json",
  "vercel.json",
  "eslint.config.mjs",
  "lint-staged.config.mjs",
  "commitlint.config.mjs",
  ".husky/pre-commit",
  ".husky/commit-msg",
];

const PM_SCOPES: [string, string[]][] = [
  ["apps", [...TS_EXTS, "package.json", "Dockerfile"]],
  ["packages", [".ts", "package.json"]],
  ["tools", [".ts", ".sh", "package.json"]],
  ["ops", [".yml", ".yaml", ".sh", ".md", "Dockerfile", "Caddyfile"]],
  [".github", [".yml", ".yaml"]],
  ["e2e", [".ts"]],
];

export const packageManager: Rule = {
  name: "package-manager",
  source: "14.3 (M14/H15)",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const files = [
      ...PM_SCOPES.flatMap(([scope, exts]) => listFiles(ctx.root, scope, exts)),
      ...PM_ROOT_FILES.filter((f) => existsRoot(ctx.root, f)),
    ];
    for (const f of files) {
      // a spec that asserts the ban necessarily contains the banned string
      if (f.endsWith(".spec.ts") || f.endsWith(".spec.tsx")) continue;
      const lines = readRoot(ctx.root, f).split("\n");
      lines.forEach((line, i) => {
        for (const { rule, re } of PM_INVOCATION) {
          if (!re.test(line)) continue;
          out.push({
            rule: this.name,
            file: `${f}:${i + 1}`,
            message: `${rule} dar repo npm (ADR-0036)`,
            fix: "use the npm equivalent (npm run / npm exec -- turbo ...)",
          });
        }
      });
    }
    return out;
  },
};
