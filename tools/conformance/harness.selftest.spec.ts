import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRules } from "./run.js";
import { RULES } from "./rules/index.js";
import { dbAccess, encodingGuard } from "./rules/v1.js";
import type { Rule } from "./lib/types.js";

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "scalpai-conf-"));
  // clean sql for tenant-safety
  const sqlDir = join(root, "packages", "db", "sql");
  mkdirSync(sqlDir, { recursive: true });
  writeFileSync(
    join(sqlDir, "0001__init.sql"),
    `CREATE TABLE IF NOT EXISTS clinics (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS patients (id uuid PRIMARY KEY, clinic_id uuid NOT NULL);
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;`,
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
  });

  it("db-access flags raw pg import outside packages/db", async () => {
    const root = fixtureRepo();
    const appDir = join(root, "apps", "api", "src");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "bad.ts"), `import { Client } from "pg";\nexport const c = Client;`, "utf8");
    const res = await runRules([dbAccess], { root });
    expect(res.violations.some((v) => v.file === "apps/api/src/bad.ts")).toBe(true);
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

  it("every registered rule has name+source and returns an array", async () => {
    for (const r of RULES as Rule[]) {
      expect(r.name).toBeTruthy();
      expect(r.source).toBeTruthy();
      const res = await r.check({ root: fixtureRepo() });
      expect(Array.isArray(res)).toBe(true);
    }
  });
});
