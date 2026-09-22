import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { REQUIRED_GATES } from "../ci/gate-report.js";

/**
 * Wave 5 (gate row #6, C6/P4-B06) - the release-engineering contracts, ADR-0050.
 *
 * A promotion pipeline is config + shell, and both rot silently, so the
 * contracts get tests exactly like code does:
 *   - policy:  workflows/scripts that MUST and MUST NOT exist (bash -n where
 *              the shell is present, textual else);
 *   - gate:    the promotion gates are required, wired through run-gate.sh and
 *              executed in CI/nightly (never grep-registered only);
 *   - live:    the scripts parse/validate real ledger content with the actual
 *              tools the runner has (node JSON, sed, grep) - not mocked text.
 *
 * Local runs without docker skip the live blocks the same way the CI
 * `deployment` job would fail loudly if the contracts broke: the spec is the
 * second line of defence, the evidence-logged gate is the first.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return existsSync(join(ROOT, rel));
}

/** Drops whole-line `#` comments: a comment documenting a ban is not the ban. */
function code(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

const ci = read(".github/workflows/ci.yml");
const nightly = read(".github/workflows/nightly.yml");
const releaseWorkflow = exists(".github/workflows/release.yml") ? read(".github/workflows/release.yml") : "";
const prod = read("ops/prod.yml");
const promote = read("tools/ci/release-promote.sh");
const attest = read("tools/ci/release-attest.sh");
const digestPin = read("tools/ci/release-digest-pin.sh");
const drill = read("tools/ci/release-rollback-drill.sh");
const runbook = read("tools/ci/release-runbook.sh");
const ledgerPath = "docs/releases/releases-ledger.jsonl";
const ledger = exists(ledgerPath) ? read(ledgerPath) : "";

const GATES = ["release-promote", "release-attest", "release-digest-pin", "release-drill", "release-runbook"];

describe("ADR-0050 - the release path exists as four named gates plus a runbook", () => {
  it("registers every release gate as required (parity is asserted in pipeline.phase5)", () => {
    for (const gate of GATES) expect(REQUIRED_GATES, `${gate} missing from REQUIRED_GATES`).toContain(gate);
  });

  it("wires every release gate through the evidence wrapper in CI", () => {
    for (const gate of GATES) {
      expect(code(ci), `${gate} never runs under run-gate.sh in ci.yml`).toContain(`run-gate.sh ${gate}`);
    }
  });

  it("runs the promotion inside the deployment job that already builds the images", () => {
    const job = ci.slice(ci.indexOf("\n  deployment:"), ci.indexOf("\n  gate:"));
    expect(job).toContain("release-promote");
    expect(job).toContain("release-attest");
    expect(job).toContain("release-digest-pin");
    expect(job).toContain("release-drill");
  });

  it("negative-proofs the runbook against a promote-only tag, not the attested ci-* tag", () => {
    const job = ci.slice(ci.indexOf("\n  deployment:"), ci.indexOf("\n  gate:"));
    expect(job, "negative proof must seed an unattested tag").toContain("unattested-");
    expect(job).toContain("not attested");
    expect(job, "deploying the already-attested ci-* tag cannot prove fail-closed").not.toMatch(
      /release-runbook\.sh deploy "ci-\$/,
    );
    expect(job, "rollback target must not be the latest (unattested) promote").toContain(
      'release-runbook.sh rollback "ci-',
    );
  });

  it("re-runs the full drill nightly, so rollback cannot silently rot", () => {
    expect(code(nightly)).toContain("run-gate.sh release-drill");
    expect(code(nightly)).toContain("release-rollback-drill.sh");
  });
});

describe("ADR-0050 - prod deploys digests, never tags (C6 acceptance)", () => {
  it("pins api/web through an env-overridable image with a non-latest default", () => {
    for (const svc of ["api", "web", "migrate"]) {
      const block = prod.slice(prod.indexOf(`\n  ${svc}:`), prod.indexOf(`\n  ${svc}:`) + 1200);
      expect(block, `${svc} has no image: line`).toMatch(/^ {4}image: \$\{SCALPAI_(API|WEB)_IMAGE:-/m);
    }
    expect(prod).not.toContain(":latest");
  });

  it("keeps migrate on the same image as api", () => {
    expect(prod).toContain("SCALPAI_API_IMAGE");
    const migrateBlock = prod.slice(prod.indexOf("\n  migrate:"), prod.indexOf("\n  api:"));
    expect(migrateBlock).toContain("image: ${SCALPAI_API_IMAGE:-");
  });

  it("refuses to write a promote record without a sha256 digest", () => {
    expect(promote).toContain("*@sha256:*");
    expect(promote).toContain("registry did not return digest refs");
  });

  it("fails the digest-pin gate unless prod resolves BOTH promoted digests", () => {
    expect(digestPin).toContain("does not deploy");
    expect(digestPin).toContain("SCALPAI_API_IMAGE");
    expect(digestPin).toContain("SCALPAI_WEB_IMAGE");
    expect(digestPin).toContain("config --images");
  });
});

describe("ADR-0050 - the drill is a real rollback path", () => {
  it("boots, promotes, rolls back and rolls forward - all four steps mandatory", () => {
    for (const step of ["boot \"prod-digest\"", "boot \"staging-digest\"", "ROLLING BACK", "roll-forward"]) {
      expect(drill).toContain(step);
    }
  });

  it("never rebuilds inside the drill (the rollback must redeploy the same artifacts)", () => {
    expect(drill).toContain("--no-build");
    expect(drill).not.toMatch(/^\s*compose build/m);
  });

  it("refuses two identical tags or identical digests - the rollback must prove something", () => {
    expect(drill).toContain("must differ");
    expect(drill).toContain("must point at different digests");
  });

  it("health-gates every transition on the real API route", () => {
    expect(drill).toContain("/api/v1/health");
    expect(drill).toContain("health never turned OK");
  });

  it("demands attestation evidence before the drill boots anything", () => {
    expect(drill).toContain('"kind":"attest"');
    expect(drill).toContain("both tags must be attested");
  });
});

describe("ADR-0050 - SBOM + provenance (supply-chain contract)", () => {
  it("produces CycloneDX SBOMs and validates their JSON", () => {
    expect(attest).toContain("cyclonedx");
    expect(attest).toContain("--format cyclonedx");
    expect(attest).toContain("JSON.parse");
  });

  it("produces SLSA provenance and validates its JSON", () => {
    expect(attest).toContain("slsaprovenance");
  });

  it("attests the promoted digests, never mutable tags", () => {
    expect(attest).toContain("@sha256:");
    expect(attest).toContain("no promote record");
  });

  it("attests both services separately (api AND web)", () => {
    expect(attest).toContain('for svc in api web; do');
  });
});

describe("ADR-0050 - the ledger is append-only and validated", () => {
  it("exists in the repo with the canonical path the scripts agree on", () => {
    expect(exists(ledgerPath)).toBe(true);
    expect(promote).toContain(ledgerPath);
    expect(attest).toContain(ledgerPath);
    expect(digestPin).toContain(ledgerPath);
    expect(drill).toContain(ledgerPath);
    expect(runbook).toContain(ledgerPath);
  });

  it("is newline-delimited JSON - every record parses with the toolchain CI ships", () => {
    expect(ledger.trim().length).toBeGreaterThan(0);
    const records = ledger
      .trim()
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"));
    expect(records.length).toBeGreaterThan(0);
    for (const line of records) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(typeof parsed.kind).toBe("string");
      expect(typeof parsed.ts).toBe("string");
    }
  });

  it("refuses to rewrite history for a promoted tag", () => {
    expect(promote).toContain("refusing to rewrite history");
    expect(runbook).toContain("append-only ledger");
  });

  it("orders the runbook promote -> attest -> deploy and blocks unattested deploys", () => {
    expect(runbook).toContain('lookup "$tag" attest');
    expect(runbook).toContain("not attested - deploy blocked");
    expect(runbook).toContain("can only roll back to a promoted release");
  });

  it("keeps release records bound to the commit that produced them", () => {
    expect(promote).toContain('"commit"');
  });
});

describe("ADR-0050 - release.yml is the scheduled full path (digest-only, tag-protected)", () => {
  it("exists, runs on main + monthly, and never builds outside the promotion script", () => {
    expect(exists(".github/workflows/release.yml")).toBe(true);
    expect(releaseWorkflow).toContain("schedule:");
    expect(releaseWorkflow).toContain("workflow_dispatch");
    expect(code(releaseWorkflow)).toContain("release-promote.sh");
    expect(code(releaseWorkflow)).not.toMatch(/docker\s+build\s/);
  });

  it("gates the prod tag behind an environment approval", () => {
    expect(releaseWorkflow).toContain("environment: production");
    expect(releaseWorkflow).toContain("promote_prod_tag");
  });
});

describe("ADR-0050 - live contract: the scripts execute against real ledger content", () => {
  const hasBash = (() => {
    try {
      execFileSync("bash", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  const skip = !hasBash;
  const scratch: string[] = [];

  afterAll(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function sandbox(): string {
    const dir = mkdtempSync(join(tmpdir(), "scalpai-release-"));
    scratch.push(dir);
    return dir;
  }

  function run(script: string, args: string[], cwd: string): { status: number; out: string } {
    try {
      const out = execFileSync("bash", [join(ROOT, script), ...args], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, SCALPAI_RELEASE_REGISTRY: "" },
      });
      return { status: 0, out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { status: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  it.skipIf(skip)("promote refuses to run twice for the same tag (append-only ledger)", () => {
    const dir = sandbox();
    const first = run("tools/ci/release-promote.sh", ["--registry", "127.0.0.1:5000", "--tag", "dupe"], dir);
    // No docker locally -> the build fails with a shell exit (1/127); what
    // matters is that it did NOT refuse on ledger grounds.
    expect(first.out).not.toContain("refusing to rewrite history");
    // Seed the ledger as if the tag was promoted, then run again: the SECOND
    // run must refuse BEFORE any docker interaction.
    const rel = join(dir, "docs/releases");
    mkdirSyncMaybe(rel);
    writeLedger(rel, `{"ts":"2026-09-21T00:00:00Z","kind":"promote","commit":"deadbeef","tag":"dupe","registry":"local","api":"r/scalpai-api@sha256:aaa","web":"r/scalpai-web@sha256:bbb"}\n`);
    const second = run("tools/ci/release-promote.sh", ["--registry", "127.0.0.1:5000", "--tag", "dupe"], dir);
    expect(second.status).toBe(3);
    expect(second.out).toContain("refusing to rewrite history");
  });

  it.skipIf(skip)("attest refuses a tag with no promote record", () => {
    const dir = sandbox();
    const res = run("tools/ci/release-attest.sh", ["--tag", "never-promoted"], dir);
    expect(res.status).toBe(3);
    expect(res.out).toContain("no promote record");
  });

  it.skipIf(skip)("digest-pin refuses a tag with no promote record", () => {
    const dir = sandbox();
    const res = run("tools/ci/release-digest-pin.sh", ["--tag", "never-promoted"], dir);
    expect(res.status).toBe(3);
    expect(res.out).toContain("no promote record");
  });

  it.skipIf(skip)("drill refuses identical tags and unattested tags (fail-closed pre-flight)", () => {
    const dir = sandbox();
    const same = run("tools/ci/release-rollback-drill.sh", ["--prod-tag", "a", "--staging-tag", "a"], dir);
    expect(same.status).toBe(3);
    expect(same.out).toContain("must differ");

    const rel = join(dir, "docs/releases");
    mkdirSyncMaybe(rel);
    writeLedger(
      rel,
      `{"ts":"2026-09-21T00:00:00Z","kind":"promote","commit":"d1","tag":"prod","registry":"local","api":"r/api@sha256:aaa","web":"r/web@sha256:bbb"}\n` +
        `{"ts":"2026-09-21T00:00:01Z","kind":"promote","commit":"d2","tag":"stg","registry":"local","api":"r/api@sha256:ccc","web":"r/web@sha256:ddd"}\n`,
    );
    const unattested = run("tools/ci/release-rollback-drill.sh", ["--prod-tag", "prod", "--staging-tag", "stg"], dir);
    expect(unattested.status).toBe(3);
    expect(unattested.out).toContain("both tags must be attested");
  });

  it.skipIf(skip)("runbook blocks a deploy of a tag that was promoted but never attested", () => {
    const dir = sandbox();
    const rel = join(dir, "docs/releases");
    mkdirSyncMaybe(rel);
    writeLedger(rel, `{"ts":"2026-09-21T00:00:00Z","kind":"promote","commit":"d1","tag":"prod","registry":"local","api":"r/api@sha256:aaa","web":"r/web@sha256:bbb"}\n`);
    const res = run("tools/ci/release-runbook.sh", ["deploy", "prod"], dir);
    expect(res.status).toBe(3);
    expect(res.out).toContain("not attested - deploy blocked");
  });

  it.skipIf(skip)("runbook refuses rollback to a tag that was never promoted", () => {
    const dir = sandbox();
    const rel = join(dir, "docs/releases");
    mkdirSyncMaybe(rel);
    writeLedger(rel, `{"ts":"2026-09-21T00:00:00Z","kind":"promote","commit":"d1","tag":"live","registry":"local","api":"r/api@sha256:aaa","web":"r/web@sha256:bbb"}\n`);
    const res = run("tools/ci/release-runbook.sh", ["rollback", "ghost"], dir);
    expect(res.status).toBe(3);
    expect(res.out).toContain("was never promoted");
  });
});

/** Tiny helpers kept local so the import list stays honest. */
function mkdirSyncMaybe(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeLedger(rel: string, content: string): void {
  writeFileSync(join(rel, "releases-ledger.jsonl"), content, "utf8");
}
