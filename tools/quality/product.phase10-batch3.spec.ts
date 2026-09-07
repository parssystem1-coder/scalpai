import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 10 batch 3 regression gate (ADR-0045).
 *
 * Batch 3 has no feature in it. It closes four places where a green LOCAL run and
 * a red gate disagreed - the exact shape of drift phase 10 exists to remove - so
 * every assertion here is about an agreement between two files, not about a
 * behaviour. Static analysis only: no database, no browser, no network.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const has = (rel: string): boolean => existsSync(join(ROOT, rel));

// Assembled, not spelled: tools/ is a scope the package-manager rule walks.
const PNPM_BIN = ["pn", "pm"].join("");

const QUARANTINE_TABLES = ["phi_plaintext_quarantine", "consent_signature_quarantine"];

describe("batch 3 / RLS - the quarantine tables are not an unregistered exception", () => {
  const rls = "packages/db/sql/0016__phase10_quarantine_rls.sql";

  it("ships the migration", () => {
    expect(has(rls)).toBe(true);
  });

  it("enables AND forces RLS on both tables, which is what tenant-safety derives", () => {
    const sql = read(rls);
    for (const table of QUARANTINE_TABLES) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }
  });

  it("keeps the app role revoked as well, because a later blanket GRANT can undo it", () => {
    const sql = read(rls);
    for (const table of QUARANTINE_TABLES) {
      expect(sql).toContain(`REVOKE ALL ON ${table} FROM scalpai_app`);
    }
  });

  it("does not turn RLS on in the file that inserts the legacy plaintext", () => {
    // 0012 INSERTs as the owner, and FORCE RLS binds the owner too: enabling it
    // there would break `migrate` on a fresh database. That is why 0016 exists.
    const phase6 = read("packages/db/sql/0012__phase6_phi_privacy.sql");
    for (const table of QUARANTINE_TABLES) {
      expect(phase6).toContain(`INSERT INTO ${table}`);
      expect(phase6).not.toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  });
});

describe("batch 3 / H15 - the package-manager rule stopped reporting itself", () => {
  const rules = "tools/conformance/rules/v2.ts";

  it("contains none of the invocations it bans", () => {
    const src = read(rules);
    expect(
      new RegExp(`\\b${PNPM_BIN}\\s+[a-z@-]`).test(src),
      "the ruleset is inside its own scope: a literal here is a self-report",
    ).toBe(false);
  });

  it("builds the banned names from fragments instead of weakening the rule", () => {
    const src = read(rules);
    expect(src).toContain("const PNPM_BIN =");
    expect(src).toContain("const YARN_BIN =");
    // Same detection, built at runtime rather than written as a literal.
    expect(src).toContain("new RegExp(`\\\\b${PNPM_BIN}\\\\s+[a-z@-]`)");
    // The rule was NOT disabled and NOT given an exception to pass.
    const exceptions = JSON.parse(read("tools/conformance/exceptions.json")) as {
      exceptions: { rule?: string; file?: string }[];
    };
    expect(exceptions.exceptions.some((e) => e.rule === "package-manager")).toBe(false);
    expect(exceptions.exceptions.some((e) => (e.file ?? "").includes("rules/v2.ts"))).toBe(false);
  });

  it("still prints the npm equivalent as the fix", () => {
    expect(read(rules)).toContain("npm run / npm exec");
  });
});

describe("batch 3 / phase 8 - the gallery fixtures point at an endpoint that exists", () => {
  const spec = "apps/api/test/analyses.spec.ts";
  const controller = "apps/api/src/media/gallery.controller.ts";

  it("opens uploads through the phase-8 endpoint", () => {
    expect(read(spec)).toContain("gallery/uploads");
  });

  it("never posts to the endpoint the phase-8 rewrite deleted", () => {
    // `POST /patients/:pid/gallery/init` answered 404 for every fixture that used
    // it; the analyses suite was failing on setup, not on its own contract.
    expect(read(spec)).not.toContain("gallery/init");
    expect(read(controller)).not.toContain("gallery/init");
  });

  it("matches the route the controller actually declares", () => {
    expect(read(controller)).toContain('@Post("patients/:pid/gallery/uploads")');
  });
});

describe("batch 3 / M2 - the licence spec asserts the server-side panel", () => {
  const spec = "apps/web/src/phase3-improvements.spec.tsx";
  const modal = "apps/web/src/components/LicenseDiagnosticsModal.tsx";
  const SERVER_SIDE = "\u0627\u0639\u062a\u0628\u0627\u0631\u0633\u0646\u062c\u06cc \u0633\u0645\u062a \u0633\u0631\u0648\u0631"; // "server-side verification"
  const CLOCK_SIMULATOR = "\u0634\u0628\u06cc\u0647\u200c\u0633\u0627\u0632\u06cc \u0639\u0642\u0628\u200c\u06a9\u0634\u06cc\u062f\u0646 \u0633\u0627\u0639\u062a \u0633\u06cc\u0633\u062a\u0645"; // the deleted "simulate clock rollback" button

  it("asserts the title the modal actually renders", () => {
    expect(read(modal)).toContain(SERVER_SIDE);
    expect(read(spec)).toContain(SERVER_SIDE);
  });

  it("keeps the deleted local simulator deleted", () => {
    expect(read(modal)).not.toContain(CLOCK_SIMULATOR);
  });

  it("drives the panel from /license/status instead of a hard-coded claims object", () => {
    const src = read(spec);
    expect(src).toContain('vi.mock("./api/client.js"');
    expect(src).toContain("/license/status");
    // The tampered verdict is now the SERVER's answer, not a local boolean.
    expect(src).toContain('state: "tampered"');
  });
});
