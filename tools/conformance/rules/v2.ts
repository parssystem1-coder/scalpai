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
 * M14a adds two more - ops-file-conventions and config-schema-validation - each
 * with a committed fixture and a self-test that runs inside `check()`.
 *
 * M14b adds the last two, at the bottom of this file - architecture-call-sites
 * and tsx-import-boundaries - which read the project graph of DESIGN-V2 14.4.
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

/* ========================================================================== *
 * M14b - architecture call-sites + import boundaries (14.4, ADR-0037)
 *
 * M14a covered the surfaces the harness could not READ. M14b covers the one it
 * could not REASON about: the project graph of DESIGN-V2 14.4. Every node in
 * that graph is only real at a CALL-SITE - an endpoint serves nothing until a
 * module mounts it, a repository query is only tenant-safe inside the
 * transaction that set the clinic key, an MCP tool is only safe with a declared
 * field whitelist, and a browser bundle stays a browser bundle only while
 * nothing inside it reaches for the API or the database.
 *
 *   architecture-call-sites  - the graph's EDGES: controller -> service ->
 *                              repository -> db, endpoint -> module, tool ->
 *                              field whitelist, connection -> clinic context.
 *   tsx-import-boundaries    - the graph's WALLS: what a `.tsx`/`.ts` inside an
 *                              app or a package is allowed to import.
 *
 * Same shape as M14a: a pure `scan*` function, a committed fixture that is a
 * miniature repository, and `fixtureSelfTest` running inside `check()` so a rule
 * that stops detecting its own seeded violation turns CI red instead of quietly
 * going green (ADR-21).
 *
 * SMART DEVIATIONS from the literal M14b brief. Each one exists because the
 * literal form would contradict a decision this repository already accepted:
 *
 *   - `@scalpai/db` is NOT banned from controllers and services. engineering
 *     rules 1 routes ALL data access through packages/db and ADR-0002 puts
 *     `DbService` on that package's PUBLIC surface, so every controller here
 *     imports it by design. What is banned is the DEEP import: a path-shaped
 *     `packages/db/...` or `@scalpai/db/src/...` specifier that walks around the
 *     public entrypoint. Raw `pg`/`drizzle-orm` imports stay the `db-access`
 *     rule's job and are not reported twice.
 *   - A repository is NOT required to spell `SET LOCAL app.clinic_id` itself.
 *     ADR-0003 opens the tenant context exactly once, in `DbService.withTenant`,
 *     and every repository function receives the resulting `Tx`. Demanding the
 *     statement per function would report all ten repositories for OBEYING that
 *     decision. What is enforced is the contract behind it: a repository may not
 *     open its own connection, it must query through a `Tx`, and any file that
 *     does open a connection must set the clinic key.
 *   - Endpoint guards stay with the `feature-gate` rule (9.1), which already
 *     walks every controller method for `@RequireFeature`/`@Roles`/`@Public`.
 *     This rule takes the other half of the Endpoints node instead: a controller
 *     nobody mounts serves nothing, and a provider nobody registers is a broken
 *     injection at boot - neither of which any gate could see before.
 *   - The MCP Tool Registry does not exist in the tree yet, so its check is a
 *     RATCHET scoped to `packages/shared/src/mcp-registry/`: zero findings
 *     today, and the day the first tool lands it must declare the fields it may
 *     return. The fixture proves the check works in the meantime.
 *
 * No exception was registered for either rule: unlike M14a's ops document,
 * neither one found legacy debt to carry.
 * ========================================================================== */

const ARCH_RULE = "architecture-call-sites";
const BOUNDARY_RULE = "tsx-import-boundaries";

const SRC_EXTS = [".ts", ".tsx"];

/** A module specifier together with the 1-based line it was written on. */
interface ImportRef {
  spec: string;
  line: number;
}

/**
 * An alias TABLE is not an import. `apps/web/vite.config.ts` and the web
 * tsconfig name `../../packages/shared/src/index.ts` on purpose - that mapping is
 * the mechanism that MAKES `@scalpai/shared` resolve, so config files are skipped
 * instead of being reported for implementing the very boundary they define.
 */
const CONFIG_FILE = /(^|\/)[\w.-]*\.config\.[cm]?tsx?$/;

/** Comments are masked first: a specifier quoted in prose is not a call-site. */
function importsOf(src: string): ImportRef[] {
  const out: ImportRef[] = [];
  maskComments(src).forEach((line, i) => {
    for (const m of line.matchAll(/\b(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)) {
      if (m[1] !== undefined) out.push({ spec: m[1], line: i + 1 });
    }
  });
  return out;
}

/** `apps/web`, `packages/db` - the workspace a repository-relative path lives in. */
function workspaceOf(rel: string): string | null {
  const m = /^((?:apps|packages)\/[^/]+)\//.exec(rel);
  return m?.[1] ?? null;
}

/** POSIX resolution of a relative specifier against the importing file. */
function resolveSpec(fromFile: string, spec: string): string {
  return toPosix(join(dirname(fromFile), spec));
}

/** Every first-party source file, minus configs, type declarations and fixtures. */
function sourceFiles(root: string): string[] {
  return [...listFiles(root, "apps", SRC_EXTS), ...listFiles(root, "packages", SRC_EXTS)].filter(
    (f) => !CONFIG_FILE.test(f) && !f.endsWith(".d.ts"),
  );
}

const IS_SPEC = /\.spec\.tsx?$|\.test\.tsx?$/;

/* -------------------------------------------------------------------------- *
 * 3. architecture-call-sites
 * -------------------------------------------------------------------------- */

type Layer = "module" | "controller" | "repository" | "service";

/**
 * Layer by NAME first, then by decorator - the NestJS suffix convention is the
 * cheap signal and the decorator is the honest one. `module` is resolved first
 * on purpose: the composition root legitimately imports every controller.
 */
function layerOf(file: string, src: string): Layer | null {
  if (/\.module\.ts$/.test(file)) return "module";
  if (/\.controller\.ts$/.test(file) || /@Controller\s*\(/.test(src)) return "controller";
  if (/\.repo\.ts$/.test(file) || /(^|\/)repos\//.test(file) || /\bclass\s+\w*Repository\b/.test(src)) {
    return "repository";
  }
  if (/\.service\.ts$/.test(file) || /@Injectable\s*\(/.test(src)) return "service";
  return null;
}

/** A path-shaped reach into packages/db. `@scalpai/db/testing` is sanctioned (H18). */
const DEEP_DB_IMPORT = /(?:^|\/)packages\/db(?:\/|$)|^@scalpai\/db\/(?!testing(?:\.js)?$)/;

/** Which layer may never import which. The call direction only points one way. */
const FORBIDDEN_EDGES: { from: Layer; to: Layer[] }[] = [
  { from: "service", to: ["controller"] },
  { from: "repository", to: ["controller", "service"] },
];

/** Resolves a relative specifier onto a file that actually exists in the tree. */
function resolveLocal(fromFile: string, spec: string, known: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolveSpec(fromFile, spec);
  const candidates = [
    base.replace(/\.jsx?$/, ".ts"),
    base.replace(/\.jsx?$/, ".tsx"),
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  return candidates.find((c) => known.has(c)) ?? null;
}

function crossLayerViolations(root: string, files: string[]): Violation[] {
  const known = new Set(files);
  const layers = new Map<string, Layer | null>();
  const sources = new Map<string, string>();
  for (const f of files) {
    const src = readRoot(root, f);
    sources.set(f, src);
    layers.set(f, layerOf(f, src));
  }

  const out: Violation[] = [];
  for (const f of files) {
    if (IS_SPEC.test(f)) continue;
    const layer = layers.get(f) ?? null;
    if (layer === null) continue;
    const insideDb = f.startsWith("packages/db/");
    const edges = FORBIDDEN_EDGES.find((e) => e.from === layer)?.to ?? [];

    for (const { spec, line } of importsOf(sources.get(f) ?? "")) {
      if (!insideDb && layer !== "module" && DEEP_DB_IMPORT.test(spec)) {
        out.push({
          rule: ARCH_RULE,
          file: `${f}:${line}`,
          message: `${layer} be masir-e daroonie packages/db vasl mishavad ('${spec}')`,
          fix: "import the public surface instead: DbService and the repos are exported from '@scalpai/db' (rules 1, ADR-0002)",
        });
        continue;
      }
      if (edges.length === 0) continue;
      const target = resolveLocal(f, spec, known);
      if (target === null) continue;
      const targetLayer = layers.get(target) ?? null;
      if (targetLayer === null || !edges.includes(targetLayer)) continue;
      out.push({
        rule: ARCH_RULE,
        file: `${f}:${line}`,
        message: `jahat-e call barakas ast: ${layer} az ${targetLayer} import mikonad ('${target}')`,
        fix: "the graph runs controller -> service -> repository -> db in one direction; invert the dependency or move the shared code down a layer",
      });
    }
  }
  return out;
}

/**
 * Endpoints node, second half. `feature-gate` proves every method DECLARES a
 * gate; this proves the class is actually wired into the application. A
 * controller no module mounts answers no request, and an `@Injectable` no module
 * registers throws at boot on the first injection - both are invisible to a
 * typecheck and to every other gate.
 *
 * Skipped entirely when the tree contains no module at all: a synthetic root
 * composes nothing, so nothing there is unmounted.
 */
function registrationViolations(root: string, files: string[]): Violation[] {
  const moduleFiles = files.filter((f) => /\.module\.ts$/.test(f));
  if (moduleFiles.length === 0) return [];
  const composition = moduleFiles.map((f) => readRoot(root, f)).join("\n");

  const out: Violation[] = [];
  for (const f of files) {
    if (!/^apps\/[^/]+\/src\//.test(f)) continue;
    if (/\.module\.ts$/.test(f) || IS_SPEC.test(f)) continue;
    const src = readRoot(root, f);

    for (const [decorator, kind, why] of [
      [/@Controller\s*\(/, "controller", "endpoint-hayash serve nemishavand"],
      [/@Injectable\s*\(/, "provider", "inject-e an dar boot mishkanad"],
    ] as [RegExp, string, string][]) {
      for (const cls of decoratedClasses(src, decorator)) {
        if (new RegExp(`\\b${cls}\\b`).test(composition)) continue;
        out.push({
          rule: ARCH_RULE,
          file: f,
          message: `${kind} '${cls}' dar hich module-i sabt nashode: ${why}`,
          fix: "add it to the controllers/providers of a @Module, or delete it - an unmounted class is not a call-site",
        });
      }
    }
  }
  return out;
}

/** `export class Foo` within a few lines of the given decorator. Comments masked. */
function decoratedClasses(src: string, decorator: RegExp): string[] {
  const lines = maskComments(src);
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!decorator.test(line)) return;
    for (const probe of lines.slice(i, i + 12)) {
      const m = /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(probe);
      if (m?.[1] !== undefined) {
        out.push(m[1]);
        return;
      }
    }
  });
  return [...new Set(out)];
}

/**
 * MCP Tool Registry node. A tool that does not name the fields it may return is
 * an open door onto whatever the query happened to select, which for this
 * product means PHI. RATCHET: the directory does not exist yet, so this is zero
 * findings today and a hard requirement the moment the first tool lands.
 */
const MCP_REGISTRY_DIR = "packages/shared/src/mcp-registry";
const MCP_FIELD_WHITELIST = /\b(?:fieldWhitelist|fieldAllowlist|fieldAllowList|allowedFields|whitelistFields)\b/;

function mcpRegistryViolations(root: string): Violation[] {
  const out: Violation[] = [];
  for (const f of listFiles(root, MCP_REGISTRY_DIR, SRC_EXTS)) {
    if (IS_SPEC.test(f)) continue;
    const src = maskComments(readRoot(root, f)).join("\n");
    const calls = [...src.matchAll(/\b(?:defineTool|registerTool|createTool|declareTool|mcpTool)\s*\(/g)];
    for (let i = 0; i < calls.length; i += 1) {
      const start = calls[i]?.index ?? 0;
      const end = i + 1 < calls.length ? (calls[i + 1]?.index ?? src.length) : src.length;
      const block = src.slice(start, end);
      if (MCP_FIELD_WHITELIST.test(block)) continue;
      const name = /name\s*:\s*["']([^"']+)["']/.exec(block)?.[1] ?? `#${i + 1}`;
      out.push({
        rule: ARCH_RULE,
        file: `${f}:${src.slice(0, start).split("\n").length}`,
        message: `MCP tool '${name}' field-whitelist tarif nakarde`,
        fix: "declare a fieldWhitelist on the tool: a registry entry may only return columns it names",
      });
    }
  }
  return out;
}

/**
 * DB Access node. The clinic key is set in exactly one place (ADR-0003), so what
 * is checked is the contract every repository depends on, not the statement:
 *
 *   1. a file that OPENS a connection must set the clinic key;
 *   2. a repository may not open one at all - it receives the tenant `Tx`;
 *   3. a repository query must run on that `Tx`, never on a free handle.
 *
 * Specs and the `@scalpai/db/testing` entrypoint are out of scope: their whole
 * job is to run outside a tenant transaction (ADR-0028 H18).
 */
const CONNECTION_OPENER = /\bnew\s+Pool\s*\(|\bcreatePool\s*\(|\bdrizzle\s*\(/;
const TENANT_CONTEXT = /app\.clinic_id/;
const TENANT_HANDLE = /\bTx\b/;
const REPO_QUERY = /\.\s*(?:select|insert|update|delete|execute)\s*\(/;

function tenantContextViolations(root: string, files: string[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    if (IS_SPEC.test(f) || /(^|\/)(test|tests|testing)[./]/.test(f)) continue;
    const src = readRoot(root, f);
    const masked = maskComments(src).join("\n");
    const opensConnection = CONNECTION_OPENER.test(masked);

    if (opensConnection && !TENANT_CONTEXT.test(masked)) {
      out.push({
        rule: ARCH_RULE,
        file: f,
        message: "connection-e database bedoone set kardan-e context-e clinic baz mishavad",
        fix: "open it through DbService.withTenant, which sets app.clinic_id inside the transaction (ADR-0003)",
      });
    }

    if (layerOf(f, src) !== "repository") continue;

    if (opensConnection) {
      out.push({
        rule: ARCH_RULE,
        file: f,
        message: "repository connection-e khodash ra baz mikonad va az tarafe withTenant rad nemishavad",
        fix: "take the tenant-scoped Tx as the first parameter; the transaction owns the connection, not the repository",
      });
    }
    if (REPO_QUERY.test(masked) && !TENANT_HANDLE.test(masked)) {
      out.push({
        rule: ARCH_RULE,
        file: f,
        message: "query-e repository rooye handle-e tenant-scoped (Tx) ejra nemishavad",
        fix: "type the handle as Tx and receive it from DbService.withTenant: without it RLS has no clinic_id to filter on",
      });
    }
  }
  return out;
}

/** Pure scan, so the fixture self-test and the regression suite can call it. */
export function scanArchitectureCallSites(root: string): Violation[] {
  const files = sourceFiles(root);
  return [
    ...crossLayerViolations(root, files),
    ...registrationViolations(root, files),
    ...mcpRegistryViolations(root),
    ...tenantContextViolations(root, files),
  ];
}

export const architectureCallSites: Rule = {
  name: ARCH_RULE,
  source: "14.4 (M14b)",
  check(ctx: RuleContext): Violation[] {
    return [
      ...scanArchitectureCallSites(ctx.root),
      ...fixtureSelfTest(ARCH_RULE, ctx.root, scanArchitectureCallSites),
    ];
  },
};

/* -------------------------------------------------------------------------- *
 * 4. tsx-import-boundaries
 * -------------------------------------------------------------------------- */

/** Apps whose build output is a BROWSER bundle: no server surface may enter it. */
const BROWSER_APPS = ["apps/web", "apps/portal"];

interface ForbiddenSurface {
  re: RegExp;
  what: string;
  instead: string;
}

const BROWSER_FORBIDDEN: ForbiddenSurface[] = [
  {
    re: /(?:^|\/)apps\/api(?:\/|$)/,
    what: "kod-e server (apps/api)",
    instead: "call the API over HTTP through the typed client in apps/web/src/api",
  },
  {
    re: /(?:^|\/)packages\/db(?:\/|$)|^@scalpai\/db(?:\/|$)/,
    what: "laye-ye database (packages/db)",
    instead: "take the types from '@scalpai/shared'; rows only ever arrive from the API",
  },
  {
    re: /^(?:pg|drizzle-orm)(?:\/|$)|^@nestjs\//,
    what: "ketabkhane-ye faghat-server",
    instead: "this bundle runs in a browser: there is no socket and no process here",
  },
];

/** `packages/x/src/...` - the internals of a package instead of its public export. */
const INTERNAL_PACKAGE_PATH = /(?:^|\/)packages\/[^/]+\/src(?:\/|$)/;

/**
 * The walls of the graph. Named for `.tsx` because that is where the leak that
 * matters happens - a component reaching for a repository ships the database
 * layer to a browser - but every first-party `.ts` is walked too: a boundary that
 * only holds for one extension is not a boundary.
 */
export function scanImportBoundaries(root: string): Violation[] {
  const out: Violation[] = [];
  for (const f of sourceFiles(root)) {
    const own = workspaceOf(f);
    if (own === null) continue;
    const isBrowserApp = BROWSER_APPS.includes(own);

    for (const { spec, line } of importsOf(readRoot(root, f))) {
      const at = `${f}:${line}`;

      // 1. a relative specifier that climbs out of its own workspace
      if (spec.startsWith(".")) {
        const target = workspaceOf(resolveSpec(f, spec));
        if (target !== null && target !== own) {
          out.push({
            rule: BOUNDARY_RULE,
            file: at,
            message: `import-e nesbi az marz-e '${own}' birun mizanad va be '${target}' miresad`,
            fix: "cross a workspace boundary through its published '@scalpai/*' entrypoint, never with a relative path",
          });
          continue;
        }
      }

      // 2. one app reaching into another - two bundles, two deploy units
      const otherApp = /(?:^|\/)apps\/([^/]+)(?:\/|$)/.exec(spec);
      if (otherApp?.[1] !== undefined && `apps/${otherApp[1]}` !== own) {
        out.push({
          rule: BOUNDARY_RULE,
          file: at,
          message: `'${own}' az app-e digari import mikonad ('apps/${otherApp[1]}')`,
          fix: "shared code belongs in a package under packages/*; an app is never another app's library",
        });
        continue;
      }

      // 3. a browser bundle reaching for a server-only surface
      if (isBrowserApp) {
        const hit = BROWSER_FORBIDDEN.find((b) => b.re.test(spec));
        if (hit !== undefined) {
          out.push({
            rule: BOUNDARY_RULE,
            file: at,
            message: `bundle-e browser '${own}' be ${hit.what} vasl mishavad ('${spec}')`,
            fix: hit.instead,
          });
          continue;
        }
      }

      // 4. anyone reaching past a package's public exports into its src/
      if (INTERNAL_PACKAGE_PATH.test(spec)) {
        out.push({
          rule: BOUNDARY_RULE,
          file: at,
          message: `masir-e daroonie yek package import shode ('${spec}') na export-e omoomi-e an`,
          fix: "import the package by name ('@scalpai/<pkg>'); packages/*/src is an implementation detail, not a contract",
        });
      }
    }
  }
  return out;
}

export const tsxImportBoundaries: Rule = {
  name: BOUNDARY_RULE,
  source: "14.4 (M14b)",
  check(ctx: RuleContext): Violation[] {
    return [...scanImportBoundaries(ctx.root), ...fixtureSelfTest(BOUNDARY_RULE, ctx.root, scanImportBoundaries)];
  },
};
