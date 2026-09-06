import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyExceptions, loadExceptions, runRules } from "./run.js";
import { RULES } from "./rules/index.js";
import { dbAccess, encodingGuard, featureGate, platformBoundaries, tenantSafety } from "./rules/v1.js";
import type { Rule, Violation } from "./lib/types.js";

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "scalpai-conf-"));
  // clean sql for tenant-safety
  const sqlDir = join(root, "packages", "db", "sql");
  mkdirSync(sqlDir, { recursive: true });
  writeFileSync(
    join(sqlDir, "0001__init.sql"),
    `CREATE TABLE IF NOT EXISTS clinics (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS patients (id uuid PRIMARY KEY, clinic_id uuid NOT NULL);
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;`,
    "utf8",
  );
  // the tenant root cannot carry clinic_id — the only legitimate exemption, and
  // it still has to name an ADR (ADR-0028).
  mkdirSync(join(root, "tools", "conformance"), { recursive: true });
  writeFileSync(
    join(root, "tools", "conformance", "exceptions.json"),
    JSON.stringify({
      exceptions: [
        { rule: "tenant-safety", file: "packages/db/sql/0001__init.sql:clinics", adr: "ADR-0028", reason: "tenant root" },
      ],
    }),
    "utf8",
  );
  return root;
}

describe("conformance v1 rules", () => {
  it("passes on a compliant fixture repo", async () => {
    const res = await runRules(RULES, { root: fixtureRepo() });
    expect(res.rulesRun).toBe(RULES.length);
    // error-contract expects api files absent → it reports once; filter it to assert the rest
    const nonContract = res.violations.filter((v) => v.rule !== "error-contract");
    expect(nonContract).toEqual([]);
    expect(res.suppressed).toBe(1);
  });

  it("db-access flags raw pg import outside packages/db", async () => {
    const root = fixtureRepo();
    const appDir = join(root, "apps", "api", "src");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "bad.ts"), `import { Client } from "pg";\nexport const c = Client;`, "utf8");
    const res = await runRules([dbAccess], { root });
    expect(res.violations.some((v) => v.file === "apps/api/src/bad.ts")).toBe(true);
  });

  it("tenant-safety derives its table list from the migrations (new table, no RLS → fail)", async () => {
    const root = fixtureRepo();
    writeFileSync(
      join(root, "packages", "db", "sql", "0002__widgets.sql"),
      `CREATE TABLE IF NOT EXISTS widgets (id uuid PRIMARY KEY, clinic_id uuid NOT NULL);`,
      "utf8",
    );
    const res = await runRules([tenantSafety], { root });
    expect(res.violations.filter((v) => v.file === "sql:widgets")).toHaveLength(2); // ENABLE + FORCE
  });

  it("tenant-safety accepts clinic_id introduced by a later ALTER TABLE", async () => {
    const root = fixtureRepo();
    writeFileSync(
      join(root, "packages", "db", "sql", "0002__late_column.sql"),
      `CREATE TABLE IF NOT EXISTS tokens (id uuid PRIMARY KEY, token_hash text NOT NULL);
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id);
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens FORCE ROW LEVEL SECURITY;`,
      "utf8",
    );
    const res = await runRules([tenantSafety], { root });
    expect(res.violations.filter((v) => v.file.endsWith(":tokens") || v.file === "sql:tokens")).toEqual([]);
  });

  it("feature-gate covers read handlers too (PHI GET without a gate)", async () => {
    const root = fixtureRepo();
    const appDir = join(root, "apps", "api", "src");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      join(appDir, "leaky.controller.ts"),
      `@Controller()\nexport class LeakyController {\n  @Get("patients")\n  list() {\n    return [];\n  }\n}\n`,
      "utf8",
    );
    const res = await runRules([featureGate], { root });
    expect(res.violations.some((v) => v.file.startsWith("apps/api/src/leaky.controller.ts"))).toBe(true);
  });

  it("platform-boundaries flags enterWith, catalog writes in controllers and public resetAll", async () => {
    const root = fixtureRepo();
    const appDir = join(root, "apps", "api", "src");
    const dbDir = join(root, "packages", "db", "src");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(appDir, "scope.ts"), `export const pin = (ctx: unknown) => als.enterWith(ctx);\n`, "utf8");
    writeFileSync(
      join(appDir, "catalog.controller.ts"),
      `import { upsertPlan } from "@scalpai/db";\nexport const write = upsertPlan;\n`,
      "utf8",
    );
    writeFileSync(join(dbDir, "index.ts"), `export { resetAll } from "./migrate.js";\n`, "utf8");

    const res = await runRules([platformBoundaries], { root });
    expect(res.violations.some((v) => v.file.startsWith("apps/api/src/scope.ts"))).toBe(true);
    expect(res.violations.some((v) => v.file === "apps/api/src/catalog.controller.ts")).toBe(true);
    expect(res.violations.some((v) => v.file === "packages/db/src/index.ts")).toBe(true);
  });

  it("platform-boundaries stays quiet on a compliant db surface", async () => {
    const root = fixtureRepo();
    const dbDir = join(root, "packages", "db", "src");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(
      join(dbDir, "index.ts"),
      `// destructive helpers (resetAll, …) live in @scalpai/db/testing\nexport { migrate } from "./migrate.js";\n`,
      "utf8",
    );
    const res = await runRules([platformBoundaries], { root });
    expect(res.violations).toEqual([]);
  });

  it("encoding-guard passes clean Persian text but flags CP1252 mojibake and U+FFFD", async () => {
    const root = fixtureRepo();
    const pkgDir = join(root, "packages", "db", "src");
    mkdirSync(pkgDir, { recursive: true });
    // legit Persian + guillemets must NOT be flagged
    writeFileSync(join(pkgDir, "clean.ts"), `// سلام دنیای «تمیز» — RTL\nexport const ok = true;\n`, "utf8");
    // classic double-encoded em-dash + Persian mojibake MUST be flagged
    writeFileSync(join(pkgDir, "moji.ts"), `const s = "\u00D8\u00B2\u00D9\u2021\u00E2\u20AC\u201C";\n`, "utf8");
    // replacement char MUST be flagged
    writeFileSync(join(pkgDir, "repl.ts"), `// broken \uFFFD comment\n`, "utf8");

    const res = await runRules([encodingGuard], { root });
    expect(res.violations.some((v) => v.file.endsWith("moji.ts"))).toBe(true);
    expect(res.violations.some((v) => v.file.endsWith("repl.ts"))).toBe(true);
    expect(res.violations.some((v) => v.file.endsWith("clean.ts"))).toBe(false);
  });

  it("exceptions without a valid ADR ref abort the harness (ADR-21)", () => {
    const root = fixtureRepo();
    mkdirSync(join(root, "tools", "conformance"), { recursive: true });
    writeFileSync(
      join(root, "tools", "conformance", "exceptions.json"),
      JSON.stringify({ exceptions: [{ file: "apps/api/src/bad.ts", reason: "no adr" }] }),
      "utf8",
    );
    expect(() => loadExceptions(root)).toThrow(/valid ADR/);
  });

  it("exceptions with ADR ref suppress matching violations only", async () => {
    const root = fixtureRepo();
    const appDir = join(root, "apps", "api", "src");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(join(root, "tools", "conformance"), { recursive: true });
    writeFileSync(join(appDir, "bad.ts"), `import { Client } from "pg";\nexport const c = Client;`, "utf8");
    writeFileSync(
      join(root, "tools", "conformance", "exceptions.json"),
      JSON.stringify({ exceptions: [{ rule: "db-access", file: "apps/api/src/bad.ts", adr: "ADR-0002", reason: "fixture" }] }),
      "utf8",
    );
    const res = await runRules([dbAccess], { root });
    expect(res.violations).toEqual([]);
    expect(res.suppressed).toBe(1);
  });

  it("applyExceptions matches rule+file and leaves others intact", () => {
    const violations: Violation[] = [
      { rule: "db-access", file: "apps/api/src/a.ts", message: "", fix: "" },
      { rule: "phi-logs", file: "apps/api/src/b.ts", message: "", fix: "" },
    ];
    const { kept, suppressed } = applyExceptions(violations, [{ rule: "db-access", adr: "ADR-0009" }]);
    expect(suppressed).toBe(1);
    expect(kept.map((v) => v.rule)).toEqual(["phi-logs"]);
  });

  it("every registered rule has name+source and returns an array", async () => {
    for (const r of RULES as Rule[]) {
      expect(r.name).toBeTruthy();
      expect(r.source).toBeTruthy();
      const res = await r.check({ root: fixtureRepo() });
      expect(Array.isArray(res)).toBe(true);
    }
  });
});
