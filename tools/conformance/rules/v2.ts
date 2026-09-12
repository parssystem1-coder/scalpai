import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import type { Rule, RuleContext, Violation } from "../lib/types.js";
import { listFiles, readRoot } from "../lib/walk.js";

/**
 * Phase 5 rule set (WEAKNESSES M14, ADR-0037). Three failure modes that kept
 * slipping past review because nothing mechanically looked for them:
 *
 *   1. package-call-site  - a workspace package nobody imports (M4/M16 debt).
 *   2. production-mocks   - SAMPLE_/MOCK_/Mocked data on a production path with
 *                           no environment gate (M1/M2).
 *   3. package-manager    - a foreign package-manager invocation in an npm
 *                           repository (H15).
 *
 * Phase B adds a fourth (M5): no-persian-literals-in-tsx, further down.
 *
 * M14a adds two more at the bottom of this file - ops-file-conventions and
 * config-schema-validation - each with a committed fixture and a self-test that
 * runs inside `check()`.
 *
 * Prose lives in docs/: this file only covers EXECUTABLE surfaces, because the
 * leftover non-npm snippets in docs/playbooks are explicitly phase 10 doc-drift
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
 *
 * The banned binary names are assembled from fragments (ADR-0045). `tools` is one
 * of the scopes this rule walks, so spelling an invocation out here - in a
 * comment or in a label - made the ruleset report ITSELF on three lines, and the
 * fix it printed (`npm run` / `npm exec`) is meaningless for a regex. Detection
 * is byte-for-byte what it was; only the literal is gone.
 */
const PNPM_BIN = ["pn", "pm"].join("");
const YARN_BIN = ["ya", "rn"].join("");

const PM_INVOCATION: { rule: string; re: RegExp }[] = [
  { rule: `${PNPM_BIN} invocation`, re: new RegExp(`\\b${PNPM_BIN}\\s+[a-z@-]`) },
  { rule: `${PNPM_BIN} packageManager`, re: new RegExp(`"packageManager"\\s*:\\s*"${PNPM_BIN}`) },
  {
    rule: `${YARN_BIN} invocation`,
    re: new RegExp(`\\b${YARN_BIN}\\s+(?:run|install|add|remove|why|workspace|dlx)\\b`),
  },
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

/**
 * M5 (phase B) - Persian copy must reach the DOM through i18n, never as a
 * literal inside a `.tsx`. A hardcoded string cannot be translated, cannot be
 * proven by the en suite, and is exactly what M5 is still open for.
 *
 * The whole U+0600-U+06FF block is rejected, including the Arabic-Indic digits
 * and the Arabic percent sign: numerals are shaped at RENDER time by `faNum()`
 * and units belong in the bundle, so a literal one of those in a component is a
 * Persian codepoint that survives into the English UI.
 *
 * SCOPE IS A RATCHET, not a glob. It currently covers the components phase A
 * migrated; the rest of `apps/web/src` (the legacy modals, the pages, the
 * dashboard shell) is the open half of M5 per ADR-0045, so enforcing every
 * `.tsx` today would fail the build on known debt instead of preventing a
 * regression. Add a path here as each component migrates - never remove one.
 */
const PERSIAN_LITERAL = /[\u0600-\u06FF]/;

const I18N_ENFORCED_TSX: string[] = [
  "apps/web/src/components/DashboardHeader.tsx",
  "apps/web/src/components/DashboardTabs.tsx",
  "apps/web/src/components/sections/",
];

/** Fixtures and specs legitimately carry Persian: they assert it, they don't ship it. */
const I18N_EXEMPT_TSX: RegExp[] = [
  /\.spec\.tsx?$/,
  /\.test\.tsx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)(test|tests|testing)\//,
  /(^|\/)data\//,
  /(^|\/)fixtures\//,
];

/**
 * Blanks out line and block comments while preserving line numbers and column
 * count, so a JSDoc that EXPLAINS the Persian handling is never reported. String
 * and template literals are kept: a literal is precisely what this rule hunts.
 * Quote tracking exists only so a `//` inside a string does not swallow the rest
 * of the line.
 */
export function maskComments(src: string): string[] {
  const masked: string[] = [];
  let inBlock = false;

  for (const line of src.split("\n")) {
    let out = "";
    let quote: string | null = null;
    let i = 0;

    while (i < line.length) {
      const ch = line[i]!;
      const next = line[i + 1];

      if (inBlock) {
        if (ch === "*" && next === "/") {
          inBlock = false;
          out += "  ";
          i += 2;
          continue;
        }
        out += " ";
        i += 1;
        continue;
      }

      if (quote !== null) {
        if (ch === "\\" && next !== undefined) {
          out += ch + next;
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        out += ch;
        i += 1;
        continue;
      }

      if (ch === "/" && next === "/") {
        out += " ".repeat(line.length - i);
        break;
      }
      if (ch === "/" && next === "*") {
        inBlock = true;
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        out += ch;
        i += 1;
        continue;
      }

      out += ch;
      i += 1;
    }

    masked.push(out);
  }

  return masked;
}

export const persianLiteralsInTsx: Rule = {
  name: "no-persian-literals-in-tsx",
  source: "9 (M5/i18n)",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const f of listFiles(ctx.root, "apps/web/src", [".tsx"])) {
      if (I18N_EXEMPT_TSX.some((re) => re.test(f))) continue;
      const enforced = I18N_ENFORCED_TSX.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p));
      if (!enforced) continue;

      const lines = maskComments(readRoot(ctx.root, f));
      for (let i = 0; i < lines.length; i += 1) {
        if (!PERSIAN_LITERAL.test(lines[i]!)) continue;
        out.push({
          rule: this.name,
          file: `${f}:${i + 1}`,
          message: "Persian literal dar TSX: copy bayad az i18n biad, na az khode component",
          fix: "move the string into apps/web/src/i18n.ts (fa AND en) and render it with t(); shape numerals with faNum()",
        });
      }
    }
    return out;
  },
};

/* ========================================================================== *
 * M14a - ops file conventions + config schema validation (14.3, ADR-0037)
 *
 * The harness covered code and SQL. It never looked at the two surfaces that
 * decide whether a clinic install survives an incident: the scripts and compose
 * files under `ops/`, and the JSON/TS configuration the gates themselves depend
 * on. Both are the classic "reviewed once, drifted forever" shape - a restore
 * script that silently continues after a failed step, a workspace whose strict
 * flags were quietly loosened, a Vite config that stops emitting the manifest
 * the bundle budget measures.
 *
 * Two rules, one committed fixture each, and a self-test that runs INSIDE
 * `check()`: on every `npm run conformance` each rule re-runs itself against
 * `tools/conformance/fixtures/<rule-name>/` and reports ITSELF when the seeded
 * violation stops firing. A rule that has been quietly gutted therefore turns
 * the build red instead of going green, which is the whole point of ADR-21.
 * ========================================================================== */

const OPS_RULE = "ops-file-conventions";
const CONFIG_RULE = "config-schema-validation";
const FIXTURE_DIR = "tools/conformance/fixtures";

const toPosix = (p: string): string => p.split(sep).join("/");

/**
 * A fixture root is a MINIATURE repository: `<fixture>/ops/...`,
 * `<fixture>/packages/...`. walk.ts ignores every directory named `fixtures`, so
 * these trees are invisible to a normal scan and can never be reported against
 * the real repository.
 */
function fixtureRootFor(root: string, rule: string): string {
  return join(root, ...FIXTURE_DIR.split("/"), rule);
}

/**
 * The in-harness half of ADR-21. Skipped when the fixture directory is absent,
 * because that is the case for the synthetic temp repositories the self-test
 * specs build - those roots are not this repository, and a fixture missing there
 * is not a finding. That the fixtures EXIST and still seed every violation is
 * asserted in tools/quality/product.phase10.spec.ts.
 */
function fixtureSelfTest(rule: string, root: string, scan: (r: string) => Violation[]): Violation[] {
  const dir = fixtureRootFor(root, rule);
  if (!existsSync(dir)) return [];
  if (scan(dir).length > 0) return [];
  return [
    {
      rule,
      file: `${FIXTURE_DIR}/${rule}`,
      message: `rule '${rule}' naghz-e fixture-e khodesh ra digar tashkhis nemidahad (self-test failed)`,
      fix: "restore the seeded violation in the fixture, or fix the rule that stopped detecting it (ADR-21)",
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * 1. ops-file-conventions
 * -------------------------------------------------------------------------- */

const OPS_EXTS = [".md", ".sh", ".ps1", ".yml", ".yaml", ".txt", ".template", ".env"];

/**
 * Compose files here are `dev.yml` / `prod.yml`, not `docker-compose.yml`: the
 * playbook names the canonical spelling, the repository uses the short one, so
 * both are recognised.
 */
const OPS_COMPOSE = /(compose[^/]*\.ya?ml|(^|\/)(dev|prod|staging)\.ya?ml)$/;
const OPS_HEADER = /^#\s+OPERATIONS:\s*\S+/;
const SHELL_STRICT_MODE = "set -euo pipefail";
const PS_STRICT_MODE = /\$ErrorActionPreference\s*=\s*["']?Stop/i;

/**
 * A credential-shaped assignment. The names are assembled from LOWERCASE
 * fragments and matched case-insensitively on purpose: written out in upper case
 * followed by `=`, this very line would be a finding for tools/secret-scan.ts,
 * whose CONFIG tier walks `.ts`. Same detection, no self-report - the treatment
 * ADR-0045 already gave the package-manager rule.
 */
const CREDENTIAL_NAMES = ["password", "passwd", "passphrase", "secret", "token", "apikey", "api_key", "access_key"];
const CREDENTIAL_ASSIGNMENT = new RegExp(
  `\\b([a-z0-9_]*(?:${CREDENTIAL_NAMES.join("|")})[a-z0-9_]*)\\s*[:=]\\s*(\\S+)`,
  "i",
);

/**
 * Shell and compose interpolation is stripped BEFORE matching. Without it,
 * `${POSTGRES_PASSWORD:?...}` reads as `PASSWORD:` followed by a value and every
 * correctly indirected variable in ops/prod.yml becomes a false positive.
 */
const SHELL_EXPANSION: RegExp[] = [/\$\{[^}]*\}/g, /\$\([^)]*\)/g, /\$[A-Za-z_][A-Za-z0-9_]*/g];

/** Files that exist to SHOW the shape of a secret. Mirrors tools/secret-scan.ts. */
const PLACEHOLDER_FILES: RegExp[] = [/(^|\/)\.env\.example$/, /\.template$/, /(^|\/)\.env\.sample$/];

/** Values that are documented as NOT a credential. Mirrors tools/secret-scan.ts. */
const CREDENTIAL_PLACEHOLDER: RegExp[] = [
  /dev_only/i,
  /example/i,
  /placeholder/i,
  /change_?me/i,
  /replace_?(me|with)/i,
  /your[_-]?/i,
  /redacted/i,
  /\btodo\b/i,
  /^<.*>$/,
  /^\/[\w./-]*$/,
];

function shellViolations(file: string, lines: string[]): Violation[] {
  const out: Violation[] = [];
  if (!(lines[0] ?? "").startsWith("#!")) {
    out.push({
      rule: OPS_RULE,
      file: `${file}:1`,
      message: "script-e ops shebang nadarad",
      fix: "start the file with #!/usr/bin/env bash",
    });
  }

  // The playbook says "line 2". Every real script here opens with a header
  // comment explaining WHY it exists, so what is enforced is the contract that
  // actually matters: strict mode before the first executable statement.
  const firstExecutable = lines.findIndex((line, i) => i > 0 && line.trim() !== "" && !line.trim().startsWith("#"));
  const strictAt = lines.findIndex((line) => line.trim() === SHELL_STRICT_MODE);
  if (strictAt === -1 || (firstExecutable !== -1 && strictAt > firstExecutable)) {
    out.push({
      rule: OPS_RULE,
      file: `${file}:${firstExecutable === -1 ? 1 : firstExecutable + 1}`,
      message: `script-e ops bedoone '${SHELL_STRICT_MODE}' ghabl az avalin dastoor`,
      fix: `add '${SHELL_STRICT_MODE}' before the first executable line: a failed step must stop the run, not be ignored`,
    });
  }
  return out;
}

/**
 * `services:` and at least one service under it. A top-level `version:` key is
 * deliberately NOT required: the Compose Spec removed it, `docker compose` warns
 * about it, and `npm run ops:validate` would start printing that warning for
 * every file the moment a rule demanded it back.
 */
function composeViolations(file: string, lines: string[]): Violation[] {
  const servicesAt = lines.findIndex((line) => /^services:\s*(#.*)?$/.test(line));
  if (servicesAt === -1) {
    return [
      {
        rule: OPS_RULE,
        file: `${file}:1`,
        message: "file-e compose kelid-e top-level 'services:' nadarad",
        fix: "declare the stack under a top-level services: key",
      },
    ];
  }
  const rest = lines.slice(servicesAt + 1);
  const firstService = rest.findIndex((line) => /^\s{2}[A-Za-z0-9][\w.-]*:/.test(line));
  const nextTopLevel = rest.findIndex((line) => /^[A-Za-z0-9]/.test(line));
  if (firstService === -1 || (nextTopLevel !== -1 && firstService > nextTopLevel)) {
    return [
      {
        rule: OPS_RULE,
        file: `${file}:${servicesAt + 1}`,
        message: "'services:' khali ast: hich service tarif nashode",
        fix: "declare at least one service, or delete the file",
      },
    ];
  }
  return [];
}

function credentialViolations(file: string, lines: string[]): Violation[] {
  if (PLACEHOLDER_FILES.some((re) => re.test(file))) return [];
  const out: Violation[] = [];
  lines.forEach((line, i) => {
    let probe = line;
    for (const re of SHELL_EXPANSION) probe = probe.replace(re, "");
    const m = CREDENTIAL_ASSIGNMENT.exec(probe);
    if (m === null) return;
    const name = m[1] ?? "";
    if (/_file$/i.test(name)) return; // a path to a mounted secret, not the secret
    const value = (m[2] ?? "").replace(/^["'`]+/, "").replace(/["'`,;]+$/, "");
    if (value === "") return;
    if (/dev_only/i.test(line)) return;
    if (CREDENTIAL_PLACEHOLDER.some((re) => re.test(value))) return;
    out.push({
      rule: OPS_RULE,
      file: `${file}:${i + 1}`,
      message: `credential-e literal ('${name}') dar file-e ops`,
      fix: "read it from the environment or a mounted secret file; a documented placeholder must say so (dev_only / example / a ${VAR} reference)",
    });
  });
  return out;
}

/** Pure scan, so the fixture self-test and the regression suite can call it. */
export function scanOpsFiles(root: string): Violation[] {
  const out: Violation[] = [];
  for (const f of listFiles(root, "ops", OPS_EXTS)) {
    const src = readRoot(root, f);
    const lines = src.split("\n");

    if (f.endsWith(".md") && !lines.slice(0, 12).some((line) => OPS_HEADER.test(line))) {
      out.push({
        rule: OPS_RULE,
        file: `${f}:1`,
        message: "sanad-e ops header-e '# OPERATIONS: <purpose>' nadarad",
        fix: "add a '# OPERATIONS: <purpose>' header line so the file states what it operates",
      });
    }
    if (f.endsWith(".sh")) out.push(...shellViolations(f, lines));
    if (f.endsWith(".ps1") && !PS_STRICT_MODE.test(src)) {
      out.push({
        rule: OPS_RULE,
        file: `${f}:1`,
        message: "script-e PowerShell bedoone ErrorActionPreference = Stop",
        fix: "set $ErrorActionPreference = 'Stop' at the top: a failed cmdlet must stop the run",
      });
    }
    if (OPS_COMPOSE.test(f)) out.push(...composeViolations(f, lines));
    out.push(...credentialViolations(f, lines));
  }
  return out;
}

export const opsFileConventions: Rule = {
  name: OPS_RULE,
  source: "14.3 (M14a)",
  check(ctx: RuleContext): Violation[] {
    return [...scanOpsFiles(ctx.root), ...fixtureSelfTest(OPS_RULE, ctx.root, scanOpsFiles)];
  },
};

/* -------------------------------------------------------------------------- *
 * 2. config-schema-validation
 * -------------------------------------------------------------------------- */

const WORKSPACE_GROUPS = ["apps", "packages"];
const REQUIRED_MANIFEST_SCRIPTS = ["build", "typecheck"];
const TSCONFIG_NAME = /(^|\/)tsconfig[^/]*\.json$/;

/**
 * strict + noUncheckedIndexedAccess, resolved THROUGH `extends`. ADR-0046 puts
 * the strict flags in exactly one file and its regression suite asserts that no
 * workspace redefines them locally, so a rule demanding a literal `strict: true`
 * in every project would contradict the decision it is supposed to enforce. What
 * matters is the EFFECTIVE value the compiler sees.
 */
const REQUIRED_TS_FLAGS = ["strict", "noUncheckedIndexedAccess"];

/**
 * The env surface is BOTH templates: a laptop needs the database and auth
 * variables, and object storage is configured for the deployed stack, so
 * demanding every name in `.env.example` alone would document nothing new and
 * report a repository that is already correct.
 */
const ENV_TEMPLATES = [".env.example", "ops/prod.env.template"];
const REQUIRED_ENV_NAMES = ["DATABASE_URL", "JWT_SECRET", "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "S3_BUCKET"];
const DOCUMENTED_ENV_NAME = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/;

/** M15: the bundle budget measures the real initial payload by walking this manifest. */
const VITE_MANIFEST = /\bmanifest\s*:\s*true\b/;

interface TsConfigFile {
  extends?: string | string[];
  compilerOptions?: Record<string, unknown>;
}

interface ManifestFile {
  name?: unknown;
  version?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  packageManager?: unknown;
}

/** tsconfigs may carry comments; the `$schema` URL must survive the strip. */
function parseJsonc<T>(src: string): T {
  return JSON.parse(maskComments(src).join("\n")) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function directoriesIn(root: string, group: string): string[] {
  const base = join(root, group);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((entry) => statSync(join(base, entry)).isDirectory())
    .map((entry) => `${group}/${entry}`)
    .sort();
}

function tsconfigFiles(root: string): string[] {
  const out = new Set<string>();
  for (const entry of readdirSync(root)) {
    if (TSCONFIG_NAME.test(entry) && statSync(join(root, entry)).isFile()) out.add(entry);
  }
  for (const scope of [...WORKSPACE_GROUPS, "tooling"]) {
    for (const f of listFiles(root, scope, [".json"])) {
      if (TSCONFIG_NAME.test(f)) out.add(f);
    }
  }
  return [...out].sort();
}

interface ResolvedConfig {
  options: Record<string, unknown>;
  broken: string[];
}

function resolveCompilerOptions(root: string, rel: string, seen = new Set<string>()): ResolvedConfig {
  if (seen.has(rel)) return { options: {}, broken: [] };
  seen.add(rel);

  let target = rel;
  if (!existsSync(join(root, target)) && !target.endsWith(".json")) target = `${target}.json`;
  if (!existsSync(join(root, target))) return { options: {}, broken: [rel] };

  let parsed: TsConfigFile;
  try {
    parsed = parseJsonc<TsConfigFile>(readFileSync(join(root, target), "utf8"));
  } catch {
    return { options: {}, broken: [`${target} (unparsable)`] };
  }

  const parents = parsed.extends === undefined ? [] : Array.isArray(parsed.extends) ? parsed.extends : [parsed.extends];
  let options: Record<string, unknown> = {};
  const broken: string[] = [];
  for (const parent of parents) {
    // A bare specifier is a PUBLISHED base config: following it means resolving
    // node_modules, which is not this rule's job.
    if (!parent.startsWith(".")) continue;
    const resolved = resolveCompilerOptions(root, toPosix(join(dirname(target), parent)), seen);
    options = { ...options, ...resolved.options };
    broken.push(...resolved.broken);
  }
  return { options: { ...options, ...(parsed.compilerOptions ?? {}) }, broken };
}

/**
 * Complements the package-manager rule instead of repeating it: that rule bans
 * the two foreign binaries by invocation, this one refuses ANY declared package
 * manager that is not npm - including one nobody has thought to ban yet.
 */
function packageManagerFieldViolations(rel: string, manifest: ManifestFile): Violation[] {
  const declared = manifest.packageManager;
  if (declared === undefined) return [];
  if (typeof declared === "string" && declared.startsWith("npm@")) return [];
  return [
    {
      rule: CONFIG_RULE,
      file: rel,
      message: `field-e packageManager npm nist: ${JSON.stringify(declared)}`,
      fix: 'npm is the only package manager (ADR-0036): declare "packageManager": "npm@<version>" or drop the field',
    },
  ];
}

function manifestViolations(root: string): Violation[] {
  const out: Violation[] = [];
  for (const group of WORKSPACE_GROUPS) {
    for (const dir of directoriesIn(root, group)) {
      const rel = `${dir}/package.json`;
      if (!existsRoot(root, rel)) continue;
      let manifest: ManifestFile;
      try {
        manifest = parseJsonc<ManifestFile>(readRoot(root, rel));
      } catch {
        out.push({
          rule: CONFIG_RULE,
          file: rel,
          message: "manifest-e workspace JSON-e salem nist",
          fix: "fix the JSON: a manifest nobody can parse is a workspace no gate covers",
        });
        continue;
      }

      const missing: string[] = [];
      if (typeof manifest.name !== "string" || manifest.name === "") missing.push("name");
      if (typeof manifest.version !== "string" || manifest.version === "") missing.push("version");
      if (!isPlainObject(manifest.scripts)) missing.push("scripts");
      if (missing.length > 0) {
        out.push({
          rule: CONFIG_RULE,
          file: rel,
          message: `manifest-e workspace field-e ejbari nadarad: ${missing.join(", ")}`,
          fix: "every workspace declares name, version and a scripts block",
        });
      }

      const scripts = manifest.scripts;
      if (isPlainObject(scripts)) {
        const absent = REQUIRED_MANIFEST_SCRIPTS.filter((s) => !(s in scripts));
        if (absent.length > 0) {
          out.push({
            rule: CONFIG_RULE,
            file: rel,
            message: `script-e ejbari nadarad: ${absent.join(", ")}`,
            fix: "a workspace turbo cannot build or typecheck is a workspace no gate covers",
          });
        }
      }

      // `dependencies` is deliberately NOT required: several workspaces here
      // legitimately have none. What IS required is that, when present, it is a
      // name -> range map rather than a list or a string.
      for (const section of ["dependencies", "devDependencies"] as const) {
        const value = manifest[section];
        if (value !== undefined && !isPlainObject(value)) {
          out.push({
            rule: CONFIG_RULE,
            file: rel,
            message: `'${section}' bayad object bashad`,
            fix: `${section} is a name -> range map`,
          });
        }
      }

      out.push(...packageManagerFieldViolations(rel, manifest));
    }
  }

  if (existsRoot(root, "package.json")) {
    try {
      out.push(...packageManagerFieldViolations("package.json", parseJsonc<ManifestFile>(readRoot(root, "package.json"))));
    } catch {
      out.push({
        rule: CONFIG_RULE,
        file: "package.json",
        message: "manifest-e root JSON-e salem nist",
        fix: "fix the JSON",
      });
    }
  }
  return out;
}

function tsconfigViolations(root: string): Violation[] {
  const out: Violation[] = [];
  for (const rel of tsconfigFiles(root)) {
    const { options, broken } = resolveCompilerOptions(root, rel);
    for (const missing of broken) {
      out.push({
        rule: CONFIG_RULE,
        file: rel,
        message: `zanjire-ye extends be config-e ghair-e ghabel-e khandan miresad: ${missing}`,
        fix: "point extends at a file that exists and parses",
      });
    }
    for (const flag of REQUIRED_TS_FLAGS) {
      if (options[flag] === true) continue;
      out.push({
        rule: CONFIG_RULE,
        file: rel,
        message: `'${flag}' dar config-e moasser true nist (${String(options[flag])})`,
        fix: "inherit tooling/tsconfig/base.json instead of loosening strictness locally (ADR-0046)",
      });
    }
  }
  return out;
}

function envTemplateViolations(root: string): Violation[] {
  // Gated on a root manifest: a synthetic tree with no repository root has no
  // env contract to document.
  if (!existsRoot(root, "package.json")) return [];

  const out: Violation[] = [];
  if (!existsRoot(root, ".env.example")) {
    out.push({
      rule: CONFIG_RULE,
      file: ".env.example",
      message: "'.env.example' vojood nadarad: gharardad-e env mostanad nashode",
      fix: "commit a .env.example documenting every variable the app reads",
    });
    return out;
  }

  const documented = new Set<string>();
  for (const rel of ENV_TEMPLATES) {
    if (!existsRoot(root, rel)) continue;
    for (const line of readRoot(root, rel).split("\n")) {
      const m = DOCUMENTED_ENV_NAME.exec(line);
      if (m !== null && m[1] !== undefined) documented.add(m[1]);
    }
  }
  const absent = REQUIRED_ENV_NAMES.filter((name) => !documented.has(name));
  if (absent.length > 0) {
    out.push({
      rule: CONFIG_RULE,
      file: ".env.example",
      message: `moteghayer-haye hassas mostanad nashode: ${absent.join(", ")}`,
      fix: `document them in ${ENV_TEMPLATES.join(" or ")} with a placeholder value`,
    });
  }
  return out;
}

function viteViolations(root: string): Violation[] {
  const out: Violation[] = [];
  for (const dir of directoriesIn(root, "apps")) {
    const rel = `${dir}/vite.config.ts`;
    if (!existsRoot(root, rel)) continue;
    if (VITE_MANIFEST.test(readRoot(root, rel))) continue;
    out.push({
      rule: CONFIG_RULE,
      file: rel,
      message: "config-e Vite 'build.manifest: true' nadarad",
      fix: "set build.manifest: true - the M15 bundle budget measures the initial payload from that manifest",
    });
  }
  return out;
}

/** Pure scan, so the fixture self-test and the regression suite can call it. */
export function scanConfigSchemas(root: string): Violation[] {
  return [
    ...manifestViolations(root),
    ...tsconfigViolations(root),
    ...envTemplateViolations(root),
    ...viteViolations(root),
  ];
}

export const configSchemaValidation: Rule = {
  name: CONFIG_RULE,
  source: "14.3 (M14a)",
  check(ctx: RuleContext): Violation[] {
    return [...scanConfigSchemas(ctx.root), ...fixtureSelfTest(CONFIG_RULE, ctx.root, scanConfigSchemas)];
  },
};
