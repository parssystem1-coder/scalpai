import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RULES } from "../conformance/rules/index.js";
import { runRules } from "../conformance/run.js";
import {
  architectureCallSites,
  configSchemaValidation,
  opsFileConventions,
  scanArchitectureCallSites,
  scanConfigSchemas,
  scanImportBoundaries,
  scanOpsFiles,
  tsxImportBoundaries,
} from "../conformance/rules/v2.js";

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const has = (rel: string): boolean => existsSync(join(ROOT, rel));

/**
 * M15b (playbook docs/playbooks/phase10-M15-bundle-budget.md). The bundle gate
 * ran in CI, but its ceiling came from BUNDLE_BUDGET_BYTES - any step could
 * raise it - and nothing proved a violation actually turns the build red. These
 * assertions run the real checker as a subprocess and lock the enforcement in
 * place: the limit lives in a committed, versioned policy; going over it exits 1
 * with limit, actual and delta; and a missing policy, a missing report or a
 * schemaVersion mismatch is fatal instead of comfortable.
 *
 * Like the rest of this suite it stays static and offline: fixtures and
 * temporary policies live in a temp directory, no real build runs here, and the
 * committed policy is never modified.
 */
describe("M15b - the bundle budget is enforced from a committed policy", () => {
  const POLICY = "tools/bundle-budget.policy.json";
  const CHECKER = "tools/bundle-budget.ts";
  const LIMIT = 307_200;
  const HEALTHY_TOTAL = 205_058;

  const tmp = mkdtempSync(join(tmpdir(), "m15b-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const fixture = (name: string, value: unknown): string => {
    const path = join(tmp, name);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return path;
  };

  /** A policy in temp - the repository one must never be edited by a test. */
  const policyFixture = (initialGzipBytes: number, schemaVersion = 1): string =>
    fixture(`policy-${schemaVersion}-${initialGzipBytes}.json`, {
      schemaVersion,
      budget: { initialGzipBytes, warningThreshold: 0.9 },
      exceptions: [],
    });

  /** An M15a-shaped report, so enforcement is tested without running a build. */
  const reportFixture = (totalGzipBytes = HEALTHY_TOTAL, schemaVersion = 1): string =>
    fixture(`report-${schemaVersion}-${totalGzipBytes}.json`, {
      schemaVersion,
      tool: CHECKER,
      manifest: ".vite/manifest.json",
      limitBytes: LIMIT,
      totalGzipBytes,
      deltaBytes: totalGzipBytes - LIMIT,
      withinBudget: totalGzipBytes <= LIMIT,
      initialPayload: {
        fileCount: 2,
        files: [
          { file: "assets/index-fixture.js", gzipBytes: totalGzipBytes - 5_000 },
          { file: "assets/index-fixture.css", gzipBytes: 5_000 },
        ],
      },
      lazyChunks: ["assets/three-engine-fixture.js"],
    });

  const TSX = join(ROOT, "node_modules", ".bin", "tsx");
  const isWin = process.platform === "win32";

  function runChecker(args: string[], env: Record<string, string> = {}): { status: number; output: string } {
    // An inherited value must never be able to decide a verdict in here.
    const clean = { ...process.env };
    delete clean.BUNDLE_BUDGET_BYTES;
    delete clean.BUNDLE_BUDGET_REPORT;
    delete clean.WEB_DIST_DIR;

    // On Windows, .bin/tsx is a shell script that spawnSync cannot execute directly.
    const viaBin = !isWin && existsSync(TSX);
    const result = spawnSync(
      viaBin ? TSX : process.execPath,
      viaBin ? [CHECKER, ...args] : ["--import", "tsx", CHECKER, ...args],
      { cwd: ROOT, encoding: "utf8", env: { ...clean, ...env } },
    );
    return { status: result.status ?? -1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }

  it("keeps the hard limit in a committed, versioned policy file", () => {
    expect(has(POLICY), `${POLICY} must be committed - the report is an artifact, the policy is not`).toBe(true);
    const policy = JSON.parse(read(POLICY)) as {
      schemaVersion: number;
      budget: { initialGzipBytes: number; warningThreshold: number };
      exceptions: unknown[];
    };
    expect(policy.schemaVersion).toBe(1);
    expect(policy.budget.initialGzipBytes).toBe(LIMIT);
    expect(policy.budget.warningThreshold).toBe(0.9);
    expect(policy.exceptions).toEqual([]);
  });

  it("passes a payload that is under the committed limit", () => {
    const result = runChecker(["--policy", POLICY, "--report", reportFixture()]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(`limit: ${LIMIT}, actual: ${HEALTHY_TOTAL}`);
    expect(result.output).toContain("within the committed policy");
  });

  it("exits 1 over the limit, naming the limit, the actual value and the excess", () => {
    const result = runChecker(["--policy", policyFixture(100_000), "--report", reportFixture()]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("BUNDLE BUDGET EXCEEDED");
    expect(result.output).toContain(`limit: 100000, actual: ${HEALTHY_TOTAL}, delta: ${HEALTHY_TOTAL - 100_000}`);
    // A failure must name a culprit, not just a number.
    expect(result.output).toContain("assets/index-fixture.js");
  });

  it("cannot be turned green by raising the ceiling through the environment", () => {
    const result = runChecker(["--policy", policyFixture(100_000), "--report", reportFixture()], {
      BUNDLE_BUDGET_BYTES: "99999999",
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("ignoring BUNDLE_BUDGET_BYTES");
  });

  it("exits 1 when the policy file is absent", () => {
    const result = runChecker(["--policy", join(tmp, "absent-policy.json"), "--report", reportFixture()]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toMatch(/policy .*absent-policy\.json does not exist/);
  });

  it("exits 1 when the report is absent instead of reporting zero bytes", () => {
    const result = runChecker(["--policy", POLICY, "--report", join(tmp, "absent-report.json")]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toMatch(/report .*absent-report\.json does not exist/);
    expect(result.output).not.toContain("bundle budget: OK");
  });

  it("exits 1 when the report and the policy disagree on schemaVersion", () => {
    const result = runChecker(["--policy", policyFixture(LIMIT, 2), "--report", reportFixture()]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("CONTRACT MISMATCH");
    expect(result.output).toContain("schemaVersion");
  });

  it("exits 1 when there is no Vite manifest to measure", () => {
    const emptyDist = join(tmp, "empty-dist");
    mkdirSync(emptyDist, { recursive: true });
    const result = runChecker(["--policy", POLICY], { WEB_DIST_DIR: emptyDist });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("no Vite manifest");
  });

  it("runs the CI gate through run-gate.sh against the committed policy", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("run-gate.sh bundle-budget");
    const gate = workflow.slice(workflow.indexOf("run-gate.sh bundle-budget"), workflow.indexOf("run-gate.sh bundle-budget") + 200);
    expect(gate).toContain("npm run budget:bundle");
    expect(gate, "the CI gate must pass the committed policy (M15b)").toContain(`--policy ${POLICY}`);
    // No invocation anywhere may fall back to the environment ceiling.
    for (const line of workflow.split("\n")) {
      if (line.includes("budget:bundle")) expect(line, line.trim()).toContain(`--policy ${POLICY}`);
    }
    // ADR-0037: the gate is only real if its evidence is required.
    expect(read("tools/ci/gate-report.ts")).toContain('"bundle-budget"');
  });
});

/**
 * M14a (playbook docs/playbooks/phase10-M14-conformance-extension.md, 14.3).
 *
 * Two new conformance rules cover the surfaces the harness could not see: the
 * scripts and compose files under `ops/`, and the JSON/TS configuration the
 * gates themselves depend on. What is proven here is not a behaviour but an
 * AGREEMENT, in three parts:
 *
 *   1. both rules are registered, so they actually run in CI;
 *   2. they are green on this repository, with the single legacy hit registered
 *      against an ADR instead of the rule being weakened to fit;
 *   3. they still detect every violation seeded in their committed fixtures -
 *      and the harness reports ITSELF when they stop.
 *
 * Static and offline like the rest of this suite: the fixtures are read, never
 * written, and the only mutation happens in a temp directory.
 */
describe("M14a - ops conventions and config schemas are machine-checked", () => {
  const OPS_RULE = "ops-file-conventions";
  const CONFIG_RULE = "config-schema-validation";
  const fixtureRoot = (rule: string): string => join(ROOT, "tools", "conformance", "fixtures", rule);

  it("registers both rules in the harness", () => {
    const names = RULES.map((r) => r.name);
    expect(names).toContain(OPS_RULE);
    expect(names).toContain(CONFIG_RULE);
    expect(RULES.length, "M14a takes the ruleset to 14").toBeGreaterThanOrEqual(14);
  });

  it("leaves this repository green, with the one legacy hit suppressed by ADR", async () => {
    const res = await runRules([opsFileConventions, configSchemaValidation], { root: ROOT });
    expect(res.violations, JSON.stringify(res.violations, null, 2)).toEqual([]);
    // ops/README.md is the only pre-M14a document without an OPERATIONS header.
    expect(res.suppressed).toBe(1);
  });

  it("registers that legacy hit against ADR-0037 rather than exempting the surface", () => {
    const registry = JSON.parse(read("tools/conformance/exceptions.json")) as {
      exceptions: { rule?: string; file?: string; adr: string; reason?: string }[];
    };
    const entries = registry.exceptions.filter((e) => e.rule === OPS_RULE);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.file).toBe("ops/README.md");
    expect(entries[0]?.adr).toBe("ADR-0037");
    // No exception may silence the config rule: it has no legacy debt to carry.
    expect(registry.exceptions.some((e) => e.rule === CONFIG_RULE)).toBe(false);
  });

  it(`${OPS_RULE} reports every violation seeded in its fixture`, () => {
    const root = fixtureRoot(OPS_RULE);
    expect(existsSync(root), `${OPS_RULE} must ship a fixture (ADR-21)`).toBe(true);
    const reported = scanOpsFiles(root).map((v) => v.file.split(":")[0]);
    for (const seeded of [
      "ops/bad-deployment.md",
      "ops/bad-script.sh",
      "ops/bad-compose.yml",
      "ops/secret-in-ops.txt",
    ]) {
      expect(reported, `${seeded} must still be reported`).toContain(seeded);
    }
  });

  it(`${CONFIG_RULE} reports every violation seeded in its fixture`, () => {
    const root = fixtureRoot(CONFIG_RULE);
    expect(existsSync(root), `${CONFIG_RULE} must ship a fixture (ADR-21)`).toBe(true);
    const reported = scanConfigSchemas(root).map((v) => v.file.split(":")[0]);
    for (const seeded of [
      "packages/bad-package/package.json",
      "packages/bad-package/tsconfig.json",
      "apps/web/vite.config.ts",
      ".env.example",
      "package.json",
    ]) {
      expect(reported, `${seeded} must still be reported`).toContain(seeded);
    }
  });

  it("resolves tsconfig strictness through extends instead of demanding a local flag", () => {
    // ADR-0046 keeps the strict flags in ONE file and forbids workspaces from
    // redefining them, so a rule that wanted a literal `strict: true` everywhere
    // would contradict the decision it enforces. Every project inherits it, and
    // none of them is reported.
    const reported = scanConfigSchemas(ROOT).map((v) => v.file);
    expect(reported.filter((f) => f.includes("tsconfig"))).toEqual([]);
    expect(read("tooling/tsconfig/base.json")).toContain('"noUncheckedIndexedAccess": true');
  });

  it("reports the RULE, not the tree, when a rule stops detecting its own fixture", async () => {
    const root = mkdtempSync(join(tmpdir(), "m14a-"));
    try {
      const neutered = join(root, "tools", "conformance", "fixtures", OPS_RULE, "ops");
      mkdirSync(neutered, { recursive: true });
      writeFileSync(join(neutered, "compliant.md"), "# OPERATIONS: a fixture that no longer violates anything\n", "utf8");

      const res = await opsFileConventions.check({ root });
      expect(res).toHaveLength(1);
      expect(res[0]?.message).toContain("self-test failed");
      expect(res[0]?.file).toContain(`fixtures/${OPS_RULE}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the fixtures out of every normal scan", () => {
    // walk.ts ignores any directory named `fixtures`, which is what lets a tree
    // of deliberately broken files live inside the repository.
    expect(read("tools/conformance/lib/walk.ts")).toContain('"fixtures"');
    expect(has("tools/conformance/fixtures/README.md")).toBe(true);
  });
});

/**
 * M14b (WEAKNESSES M14, DESIGN-V2 14.4, ADR-0037).
 *
 * M14a taught the harness to READ two new surfaces. M14b teaches it to REASON
 * about the project graph: the edges between the layers, and the walls between
 * the workspaces. Both are things a typecheck cannot see, because every one of
 * them compiles perfectly.
 *
 * What is proven here, again as an agreement rather than a behaviour:
 *
 *   1. both rules are registered, so they really run in CI;
 *   2. they are green on this repository with NO exception at all - unlike M14a,
 *      neither one found legacy debt to carry;
 *   3. they still report every violation seeded in their committed fixtures, and
 *      the harness reports ITSELF the moment one stops;
 *   4. the deliberate deviations hold: '@scalpai/db' stays legal for a
 *      controller, tenant context stays in withTenant, and an alias table is not
 *      an import.
 *
 * Static and offline: fixtures are read, never written; the only mutation is in a
 * temp directory.
 */
describe("M14b - architecture call-sites and import boundaries are machine-checked", () => {
  const ARCH_RULE = "architecture-call-sites";
  const BOUNDARY_RULE = "tsx-import-boundaries";
  const fixtureRoot = (rule: string): string => join(ROOT, "tools", "conformance", "fixtures", rule);

  it("registers both rules in the harness", () => {
    const names = RULES.map((r) => r.name);
    expect(names).toContain(ARCH_RULE);
    expect(names).toContain(BOUNDARY_RULE);
    expect(RULES.length, "M14b takes the ruleset to 16").toBeGreaterThanOrEqual(16);
  });

  it("leaves this repository green with nothing suppressed", async () => {
    const res = await runRules([architectureCallSites, tsxImportBoundaries], { root: ROOT });
    expect(res.violations, JSON.stringify(res.violations, null, 2)).toEqual([]);
    expect(res.suppressed, "M14b carries no legacy debt: nothing may be hidden behind an exception").toBe(0);
  });

  it("registers no exception for either rule", () => {
    const registry = JSON.parse(read("tools/conformance/exceptions.json")) as {
      exceptions: { rule?: string; adr: string }[];
    };
    expect(registry.exceptions.some((e) => e.rule === ARCH_RULE)).toBe(false);
    expect(registry.exceptions.some((e) => e.rule === BOUNDARY_RULE)).toBe(false);
  });

  it(`${ARCH_RULE} reports every violation seeded in its fixture`, () => {
    const root = fixtureRoot(ARCH_RULE);
    expect(existsSync(root), `${ARCH_RULE} must ship a fixture (ADR-21)`).toBe(true);
    const violations = scanArchitectureCallSites(root);
    const reported = violations.map((v) => v.file.split(":")[0]);
    for (const seeded of [
      "apps/api/src/bad-controller-direct-db.ts",
      "apps/api/src/bad-service-no-guard.ts",
      "packages/shared/src/mcp-registry/bad-mcp-tool-no-whitelist.ts",
      "packages/db/src/repos/bad-repo-no-clinic-id.ts",
    ]) {
      expect(reported, `${seeded} must still be reported`).toContain(seeded);
    }

    // Each of the four graph nodes has to be represented, not just the file list.
    const messages = violations.map((v) => v.message).join("\n");
    expect(messages, "cross-layer edge").toContain("packages/db");
    expect(messages, "endpoint node: an unmounted controller").toContain("BadDirectDbController");
    expect(messages, "provider registration").toContain("BadUnregisteredService");
    expect(messages, "MCP tool registry node").toContain("patients.search");
    expect(messages, "db access node").toContain("Tx");
    // The compliant tool in the same fixture file must NOT be reported.
    expect(messages).not.toContain("patients.summary");
  });

  it(`${BOUNDARY_RULE} reports every violation seeded in its fixture`, () => {
    const root = fixtureRoot(BOUNDARY_RULE);
    expect(existsSync(root), `${BOUNDARY_RULE} must ship a fixture (ADR-21)`).toBe(true);
    const reported = scanImportBoundaries(root).map((v) => v.file.split(":")[0]);
    for (const seeded of [
      "apps/web/src/web-bad-import-api.ts",
      "apps/web/src/web-bad-import-db.tsx",
      "apps/portal/src/portal-bad-import-web.tsx",
      "packages/shared/src/shared-bad-internal-export.ts",
    ]) {
      expect(reported, `${seeded} must still be reported`).toContain(seeded);
    }
  });

  it("keeps '@scalpai/db' legal for a controller and bans only the deep path", () => {
    // engineering rules 1 routes all data access through packages/db and ADR-0002
    // puts DbService on its PUBLIC surface: a rule banning the package name would
    // report every controller in the repository for obeying the decision.
    expect(read("apps/api/src/app.module.ts")).toContain('from "@scalpai/db"');
    expect(scanArchitectureCallSites(ROOT)).toEqual([]);
  });

  it("leaves the tenant context where ADR-0003 put it", () => {
    // The clinic key is set once, in withTenant, and every repository receives
    // the resulting Tx. Demanding the statement per function would report all ten.
    expect(read("packages/db/src/tenant.ts")).toContain("set_config('app.clinic_id'");
    const repoFindings = scanArchitectureCallSites(ROOT).filter((v) => v.file.includes("/repos/"));
    expect(repoFindings).toEqual([]);
  });

  it("mounts every controller it finds in a module", () => {
    const module = read("apps/api/src/app.module.ts");
    for (const cls of ["GalleryController", "SyncController", "OpsController", "PrivacyController"]) {
      expect(module, `${cls} must be mounted`).toContain(cls);
    }
  });

  it("does not mistake an alias table for an import", () => {
    // vite.config.ts and the web tsconfig name ../../packages/shared/src on
    // purpose - that mapping is what MAKES '@scalpai/shared' resolve.
    expect(read("apps/web/vite.config.ts")).toContain("packages/shared/src");
    expect(scanImportBoundaries(ROOT)).toEqual([]);
  });

  it("reports the RULE, not the tree, when either rule stops detecting its own fixture", async () => {
    const root = mkdtempSync(join(tmpdir(), "m14b-"));
    try {
      const arch = join(root, "tools", "conformance", "fixtures", ARCH_RULE, "apps", "api", "src");
      mkdirSync(arch, { recursive: true });
      writeFileSync(join(arch, "compliant.ts"), 'export const ok = "nothing to find here";\n', "utf8");

      const boundary = join(root, "tools", "conformance", "fixtures", BOUNDARY_RULE, "apps", "web", "src");
      mkdirSync(boundary, { recursive: true });
      writeFileSync(join(boundary, "compliant.tsx"), 'import { t } from "@scalpai/shared";\nexport const Ok = () => t;\n', "utf8");

      for (const [rule, name] of [
        [architectureCallSites, ARCH_RULE],
        [tsxImportBoundaries, BOUNDARY_RULE],
      ] as const) {
        const res = await rule.check({ root });
        expect(res, `${name} must report itself`).toHaveLength(1);
        expect(res[0]?.message).toContain("self-test failed");
        expect(res[0]?.file).toContain(`fixtures/${name}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
