import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RULES } from "../conformance/rules/index.js";
import { runRules } from "../conformance/run.js";
import { configSchemaValidation, opsFileConventions, scanConfigSchemas, scanOpsFiles } from "../conformance/rules/v2.js";

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
