import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REQUIRED_GATES, auditGates, parseEvidence } from "./gate-report.js";
import { initialPayload } from "../bundle-budget.js";
import { scanText } from "../secret-scan.js";

/**
 * Phase 5 regression suite - "CI/CD, tests and real gatekeeping".
 *
 * Every assertion maps to a WEAKNESSES item that was closed by editing a
 * pipeline or tooling file. A pipeline is config, config rots silently, so it
 * gets tests exactly like code does. CI additionally RUNS all of it, and the
 * `gate` job re-checks the recorded evidence (ADR-0037).
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Drops whole-line `#` comments: a comment documenting a banned pattern is not the pattern. */
function code(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

const ci = read(".github/workflows/ci.yml");
const nightly = read(".github/workflows/nightly.yml");
const codeql = read(".github/workflows/codeql.yml");
const dependabot = read(".github/dependabot.yml");
const rootPkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const playwright = read("playwright.config.ts");
const vitestConfig = read("vitest.config.ts");
const viteConfig = read("apps/web/vite.config.ts");
const apiMain = read("apps/api/src/main.ts");

function jobs(workflow: string): string[] {
  const jobsSection = workflow.split(/^jobs:\s*$/m)[1] ?? workflow;
  return [...jobsSection.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]!).sort();
}

function gatesOf(workflow: string): string[] {
  return [...new Set([...workflow.matchAll(/run-gate\.sh\s+([a-z0-9-]+)/g)].map((m) => m[1]!))].sort();
}

describe("H14/R7 - job names describe the work, and the work covers every workspace", () => {
  it("declares the jobs the pipeline actually performs", () => {
    expect(jobs(ci)).toEqual(["deployment", "e2e-smoke", "gate", "lockfile", "security", "verify"]);
  });

  it("typechecks and builds through turbo, not a single workspace", () => {
    expect(rootPkg.scripts.typecheck).toContain("turbo run typecheck");
    expect(rootPkg.scripts.build).toContain("turbo run build");
    expect(ci).toContain("run-gate.sh typecheck npm run typecheck");
    expect(ci).toContain("run-gate.sh build npm run build");
  });
});

describe("L1/W23 - no gate certifies itself", () => {
  it("routes every gate through the evidence wrapper", () => {
    expect(existsSync(join(ROOT, "tools/ci/run-gate.sh"))).toBe(true);
    const wrapper = read("tools/ci/run-gate.sh");
    expect(wrapper).toContain("command=$*");
    expect(wrapper).toContain("exit=$code");
    // the wrapper must propagate the real exit code, never swallow it
    expect(wrapper).toContain('exit "$code"');
  });

  it("keeps ci.yml and REQUIRED_GATES in exact parity", () => {
    expect(gatesOf(ci)).toEqual([...REQUIRED_GATES].sort());
  });

  it("has a gate job that waits for everything and re-reads the logs", () => {
    const gateJob = ci.slice(ci.indexOf("\n  gate:"));
    expect(gateJob).toContain("needs: [lockfile, verify, security, e2e-smoke, deployment]");
    expect(gateJob).toContain("if: always()");
    expect(gateJob).toContain("npm run ci:gate");
    expect(rootPkg.scripts["ci:gate"]).toContain("tools/ci/gate-report.ts");
  });

  it("fails when a required gate produced no log", () => {
    const dir = mkdtempSync(join(tmpdir(), "scalpai-evidence-"));
    writeFileSync(join(dir, "typecheck.log"), "gate=typecheck\ncommand=npm run typecheck\nexit=0\n", "utf8");
    const result = auditGates(dir, ["typecheck", "lint"]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["lint"]);
  });

  it("fails when a gate log records a non-zero exit", () => {
    const dir = mkdtempSync(join(tmpdir(), "scalpai-evidence-"));
    writeFileSync(join(dir, "lint.log"), "gate=lint\ncommand=npm run lint\nexit=1\n", "utf8");
    const result = auditGates(dir, ["lint"]);
    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(["lint"]);
  });

  it("refuses a log that has no command recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "scalpai-evidence-"));
    writeFileSync(join(dir, "lint.log"), "gate=lint\nexit=0\n", "utf8");
    expect(auditGates(dir, ["lint"]).missing).toEqual(["lint"]);
  });

  it("passes only with a command log and exit=0 for every gate, including nested artifacts", () => {
    const dir = mkdtempSync(join(tmpdir(), "scalpai-evidence-"));
    mkdirSync(join(dir, "evidence-verify"), { recursive: true });
    writeFileSync(join(dir, "lint.log"), "gate=lint\ncommand=npm run lint\nexit=0\n", "utf8");
    writeFileSync(
      join(dir, "evidence-verify", "typecheck.log"),
      "gate=typecheck\ncommand=npm run typecheck\nexit=0\n",
      "utf8",
    );
    const result = auditGates(dir, ["lint", "typecheck"]);
    expect(result.ok).toBe(true);
    expect(result.rows.every((r) => r.status === "pass")).toBe(true);
  });

  it("lets a failed re-run override an earlier green log for the same gate", () => {
    const dir = mkdtempSync(join(tmpdir(), "scalpai-evidence-"));
    mkdirSync(join(dir, "a"), { recursive: true });
    mkdirSync(join(dir, "b"), { recursive: true });
    writeFileSync(join(dir, "a", "build.log"), "gate=build\ncommand=npm run build\nexit=0\n", "utf8");
    writeFileSync(join(dir, "b", "build.log"), "gate=build\ncommand=npm run build\nexit=2\n", "utf8");
    expect(auditGates(dir, ["build"]).failed).toEqual(["build"]);
  });

  it("parses the wrapper header format", () => {
    const evidence = parseEvidence(
      "ci-evidence/lint.log",
      "gate=lint\ncommand=npm run lint\ncommit=abc1234\n--- output ---\nall good\nexit=0\n",
    );
    expect(evidence).toMatchObject({ gate: "lint", command: "npm run lint", commit: "abc1234", exit: 0 });
  });
});

describe("H16 - the lockfile is the contract", () => {
  it("installs with npm ci and no fallback anywhere in CI", () => {
    const steps = code(ci);
    expect(steps).toContain("npm ci --legacy-peer-deps");
    expect(steps).not.toContain("npm install");
    expect(steps).not.toContain("if [ -f package-lock.json ]");
  });

  it("reviews the lockfile as its own gate", () => {
    const review = read("tools/ci/lockfile-review.sh");
    expect(ci).toContain("run-gate.sh lockfile bash tools/ci/lockfile-review.sh");
    expect(review).toContain("package.json changed without package-lock.json");
    expect(review).toContain("lockfileVersion");
    expect(review).toContain("registry");
  });

  it("checks out full history so the lockfile diff exists", () => {
    const lockJob = ci.slice(ci.indexOf("\n  lockfile:"), ci.indexOf("\n  verify:"));
    expect(lockJob).toContain("fetch-depth: 0");
  });
});

describe("H14 - coverage reaches the API and the critical web paths", () => {
  it("measures more than the logic packages", () => {
    expect(vitestConfig).toContain('"apps/api/src/**"');
    expect(vitestConfig).toContain('"apps/web/src/api/**"');
    expect(vitestConfig).toContain('"apps/web/src/context/**"');
    expect(vitestConfig).toContain('"apps/web/src/offline/**"');
  });

  it("sets a threshold per area instead of one number for the packages only", () => {
    expect(vitestConfig).toContain('/src/**": { lines: 70 }');
    expect(vitestConfig).toContain('"apps/api/src/**": { lines:');
    expect(vitestConfig).toContain('"apps/web/src/{api,context,offline}/**": { lines:');
  });

  it("emits a machine-readable report CI can keep", () => {
    expect(vitestConfig).toContain("json-summary");
    expect(vitestConfig).toContain("lcov");
    expect(ci).toContain("name: coverage");
  });
});

describe("H14 - supply chain and secrets are gated in CI", () => {
  it("runs npm audit at high severity", () => {
    expect(rootPkg.scripts["audit:ci"]).toContain("--audit-level=high");
    expect(ci).toContain("run-gate.sh audit npm run audit:ci");
  });

  it("runs a repository-wide secret scan", () => {
    expect(rootPkg.scripts["scan:secrets"]).toContain("tools/secret-scan.ts");
    expect(ci).toContain("run-gate.sh secret-scan npm run scan:secrets");
  });

  it("analyses TypeScript with CodeQL under one explicit condition", () => {
    expect(codeql).toContain("languages: javascript-typescript");
    expect(codeql).toContain("github/codeql-action/analyze@v3");
    // the ONLY opt-out is visible in the workflow, not hidden in a comment
    expect(codeql).toContain("vars.ENABLE_CODEQL");
  });

  it("keeps dependencies updated through Dependabot on every ecosystem in use", () => {
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("package-ecosystem: github-actions");
    expect(dependabot).toContain("package-ecosystem: docker");
  });

  it("detects provider credentials anywhere", () => {
    const findings = scanText("ops/deploy.sh", "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n");
    expect(findings.map((f) => f.rule)).toContain("private-key");
  });

  it("detects a committed config secret but accepts documented placeholders", () => {
    expect(scanText("ops/prod.yml", "POSTGRES_PASSWORD: hunter2hunter2hunter2")).toHaveLength(1);
    expect(scanText("ops/prod.yml", "POSTGRES_PASSWORD: scalpai_dev_only")).toEqual([]);
    expect(scanText("ops/prod.yml", "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}")).toEqual([]);
    expect(scanText(".env.example", "JWT_SECRET=0123456789abcdef0123456789abcdef")).toEqual([]);
    expect(scanText("docs/ops/DEPLOYMENT.md", "JWT_SECRET=0123456789abcdef0123456789abcdef")).toEqual([]);
  });
});

describe("M17 - images are built AND scanned in CI", () => {
  it("builds both images and scans what it built", () => {
    expect(ci).toContain("run-gate.sh docker-build docker compose");
    expect(ci).toContain("run-gate.sh image-scan bash ../tools/ci/image-scan.sh api web");
    const scan = read("tools/ci/image-scan.sh");
    expect(scan).toContain("trivy");
    expect(scan).toContain("--exit-code 1");
    // resolves the image compose actually built, never a guessed tag
    expect(scan).toContain("images -q");
  });
});

describe("H15 - the browser suite runs against a real, addressable stack", () => {
  it("lets the API listen on the port the suite chose", () => {
    expect(apiMain).toContain("env.PORT");
    expect(apiMain).not.toMatch(/const port = 3000;/);
  });

  it("derives every Playwright URL from that same port", () => {
    expect(playwright).toContain("process.env.API_PORT");
    expect(playwright).toContain("process.env.WEB_PORT");
    expect(playwright).toContain("PORT: String(API_PORT)");
  });

  it("keeps failure artifacts worth reading", () => {
    expect(playwright).toContain('trace: "retain-on-failure"');
    expect(playwright).toContain("junit");
    expect(ci).toContain("name: playwright-report");
  });

  it("runs @smoke on every PR and the full suite nightly", () => {
    expect(rootPkg.scripts["e2e:smoke"]).toContain("--grep @smoke");
    expect(rootPkg.scripts.e2e).toBe("playwright test");
    expect(ci).toContain("run-gate.sh e2e-smoke npm run e2e:smoke");
    expect(nightly).toContain("schedule:");
    expect(nightly).toContain("cron:");
    expect(nightly).toContain("run-gate.sh e2e-full npm run e2e");
    expect(nightly).not.toContain("--grep");
  });

  it("drives /login and stable test ids from one helper", () => {
    const helper = read("e2e/helpers/session.ts");
    expect(helper).toContain('page.goto("/login")');
    expect(helper).toContain('getByTestId("login-email")');
    expect(helper).toContain('getByTestId("patients-title")');

    for (const spec of ["smoke", "offline", "analysis", "upload-big"]) {
      const text = read(`e2e/${spec}.spec.ts`);
      expect(text, `${spec} must use the session helper`).toContain("./helpers/session.js");
      expect(text, `${spec} must not open the landing page to log in`).not.toContain('page.goto("/")');
      expect(text, `${spec} must not match login copy by label`).not.toContain("getByLabel");
    }
  });

  it("exposes those test ids in the pages under test", () => {
    const login = read("apps/web/src/pages/LoginPage.tsx");
    for (const id of ["login-form", "login-email", "login-password", "login-submit"]) {
      expect(login).toContain(`data-testid="${id}"`);
    }
    const patients = read("apps/web/src/pages/PatientsPage.tsx");
    for (const id of ["patients-title", "patient-form", "patient-first-name", "patient-phone", "patient-add", "patient-row"]) {
      expect(patients).toContain(`data-testid="${id}"`);
    }
  });
});

describe("M15 - the bundle budget measures the real initial payload", () => {
  it("asks Vite for a manifest", () => {
    expect(viteConfig).toContain("manifest: true");
  });

  it("walks the static import graph and excludes dynamic chunks", () => {
    const manifest = {
      "index.html": { file: "index.html", isEntry: true, imports: ["src/main.tsx"] },
      "src/main.tsx": {
        file: "assets/index-abc.js",
        isEntry: true,
        css: ["assets/index-abc.css"],
        imports: ["_vendor-def.js"],
        dynamicImports: ["_scalp3d-xyz.js"],
      },
      "_vendor-def.js": { file: "assets/vendor-def.js" },
      "_scalp3d-xyz.js": { file: "assets/scalp3d-xyz.js" },
    };
    expect(initialPayload(manifest)).toEqual([
      "assets/index-abc.css",
      "assets/index-abc.js",
      "assets/vendor-def.js",
      "index.html",
    ]);
  });

  it("notices a lazy chunk that became static", () => {
    const manifest = {
      "src/main.tsx": { file: "assets/index-abc.js", isEntry: true, imports: ["_scalp3d-xyz.js"] },
      "_scalp3d-xyz.js": { file: "assets/scalp3d-xyz.js" },
    };
    expect(initialPayload(manifest)).toContain("assets/scalp3d-xyz.js");
  });
});

describe("CI hygiene - cancellation and artifact retention", () => {
  it("cancels superseded runs", () => {
    expect(ci).toContain("concurrency:");
    expect(ci).toContain("cancel-in-progress: true");
    expect(nightly).toContain("concurrency:");
  });

  it("gives every uploaded artifact an explicit retention", () => {
    for (const workflow of [ci, nightly]) {
      const uploads = [...workflow.matchAll(/uses: actions\/upload-artifact@v4/g)].length;
      const retentions = [...workflow.matchAll(/retention-days:/g)].length;
      expect(uploads).toBeGreaterThan(0);
      expect(retentions).toBe(uploads);
    }
  });
});

describe("M14/H15 - npm is the only package manager on executable surfaces", () => {
  const files = [
    ".github/workflows/ci.yml",
    ".github/workflows/nightly.yml",
    ".github/workflows/codeql.yml",
    "tools/ci/run-gate.sh",
    "tools/ci/image-scan.sh",
    "tools/ci/gate-report.ts",
    "tools/secret-scan.ts",
    "tools/bundle-budget.ts",
    "packages/db/src/load-env.ts",
    "packages/db/scripts/seed-gallery.ts",
    "e2e/helpers/session.ts",
  ];
  for (const rel of files) {
    it(`${rel} invokes no pnpm/yarn`, () => {
      expect(existsSync(join(ROOT, rel)), `${rel} is missing`).toBe(true);
      expect(read(rel)).not.toMatch(/\bpnpm\s+[a-z@-]/);
      expect(read(rel)).not.toMatch(/\byarn\s+(?:run|install|add)\b/);
    });
  }
});
