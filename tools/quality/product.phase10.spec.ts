import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 10 regression gate (ADR-0043, ADR-0044).
 *
 * Every assertion here corresponds to a claim that was once in the docs with
 * nothing behind it. A reviewer forgets; this file does not. It is deliberately
 * static analysis: it needs no database, no browser and no network, so it runs in
 * the same cheap job as the unit suite.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const has = (rel: string): boolean => existsSync(join(ROOT, rel));

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", ".git"]);

function walk(relDir: string, exts: string[]): string[] {
  const base = join(ROOT, relDir);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (exts.some((e) => entry.endsWith(e))) out.push(relative(ROOT, full).split(sep).join("/"));
    }
  };
  visit(base);
  return out;
}

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const manifest = (rel: string): Manifest => JSON.parse(read(rel)) as Manifest;

const PHASE_FILE = "docs/WEAKNESSES-V2-10-PHASES.md";
const PHASE_10_HEADING = "# \u0641\u0627\u0632 \u06f1\u06f0:";
const PHASE_SUMMARY_HEADING = "## \u0648\u0636\u0639\u06cc\u062a \u0641\u0627\u0632\u0647\u0627";

describe("H10 - patient search is wired and indexed", () => {
  const migration = "packages/db/sql/0015__phase10_search_trigram.sql";

  it("ships the trigram migration", () => {
    expect(has(migration)).toBe(true);
  });

  it("requires pg_trgm rather than degrading to a sequential scan", () => {
    const sql = read(migration);
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(sql).toContain("RAISE EXCEPTION");
  });

  it("indexes every column the search predicate touches", () => {
    const sql = read(migration);
    for (const column of ["first_name", "last_name", "phone"]) {
      expect(sql).toContain(`${column} gin_trgm_ops`);
    }
    // Partial on live rows only: the predicate never looks at soft-deleted ones.
    expect(sql.match(/WHERE deleted_at IS NULL/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("keeps the contract as the single owner of the search term", () => {
    const contracts = read("packages/shared/src/contracts.ts");
    // Both keys are published from one transform - the repo reads `search`, the
    // HTTP surface sends `q`, and they can no longer disagree.
    expect(contracts).toContain("return { q: term, search: term, limit, offset };");
  });

  it("still reads `search` in the repository, which is why the contract must set it", () => {
    expect(read("packages/db/src/repos/core.repo.ts")).toContain("q.search");
  });
});

describe("H13 - an analysis says what produced it", () => {
  it("requires provenance on the wire", () => {
    const contracts = read("packages/shared/src/contracts.ts");
    expect(contracts).toContain("provenance: AnalysisProvenance");
    expect(contracts).toContain("provenance.model.version");
  });

  it("keeps every registered model non-diagnostic", () => {
    const registry = read("packages/shared/src/analysis-provenance.ts");
    expect(registry).toContain("ANALYSIS_MODEL_REGISTRY");
    expect(registry).toContain("diagnostic: false");
    expect(registry).toContain("ANALYSIS_NON_DIAGNOSTIC_LABEL");
  });

  it("renders the non-diagnostic label with the result, not as footnote", () => {
    const page = read("apps/web/src/pages/AnalysisPage.tsx");
    expect(page).toContain("ANALYSIS_NON_DIAGNOSTIC_LABEL");
    expect(page).toContain("non-diagnostic-label");
    // The digest must be of the buffer handed to the engine.
    expect(page).toContain("sha256Hex(imageData.data)");
  });

  it("persists the provenance with the scores", () => {
    expect(read("apps/api/src/analyses.controller.ts")).toContain("provenance: dto.result.provenance");
  });
});

describe("M2 - the licence verdict comes from the server", () => {
  it("has a verifying endpoint", () => {
    expect(has("apps/api/src/licensing/license.service.ts")).toBe(true);
    expect(has("apps/api/src/licensing/license.controller.ts")).toBe(true);
    const service = read("apps/api/src/licensing/license.service.ts");
    expect(service).toContain("createPublicKey");
    expect(service).toContain("unlicensed");
  });

  it("is registered in the module graph", () => {
    const module = read("apps/api/src/app.module.ts");
    expect(module).toContain("LicenseController");
    expect(module).toContain("LicenseService");
  });

  it("stopped deriving a state in the browser", () => {
    const modal = read("apps/web/src/components/LicenseDiagnosticsModal.tsx");
    expect(modal).toContain("/license/status");
    expect(modal).not.toContain("Ed25519 Verified");
    // The old panel invented these locally.
    expect(modal).not.toContain("licenseClaims");
    expect(modal).not.toContain("simulatedClockDrift");
  });

  it("never hard-codes licence key material", () => {
    for (const rel of [
      "apps/api/src/licensing/license.service.ts",
      "apps/api/src/licensing/license.config.ts",
      "apps/web/src/components/LicenseDiagnosticsModal.tsx",
    ]) {
      expect(read(rel)).not.toContain("BEGIN PUBLIC KEY");
    }
  });
});

describe("M3 - the desktop shell claims nothing it cannot do", () => {
  const shell = "apps/desktop/src/index.ts";

  it("has no fabricated device inventory", () => {
    const src = read(shell);
    for (const fiction of ["Dino-Lite", "Firefly", "MEDL4HM", "DE330T", "UvcDeviceManager", "uvcDeviceSupported"]) {
      expect(src, `desktop shell must not mention ${fiction}`).not.toContain(fiction);
    }
  });

  it("reports capability as false until a bridge exists", () => {
    const src = read(shell);
    expect(src).toContain("available: false");
    expect(src).toContain("trichoscopyCapability");
  });

  it("does not log a detection count at import time", () => {
    expect(read(shell)).not.toContain("console.log");
  });
});

describe("M7/R13 - no scaffold credentials at the root", () => {
  it("keeps the deleted scaffold configs deleted", () => {
    for (const forbidden of ["firebase-applet-config.json", "metadata.json", "firebase.json", ".firebaserc"]) {
      expect(has(forbidden), `${forbidden} must not exist at the repository root`).toBe(false);
    }
  });

  it("teaches the scan the shapes that got through", () => {
    const scan = read("tools/secret-scan.ts");
    expect(scan).toContain("google-oauth-client-id");
    // .mjs/.cjs/.html/.webmanifest were unscanned config surfaces.
    for (const surface of ["\\.mjs$", "\\.cjs$", "\\.html$", "\\.webmanifest$"]) {
      expect(scan).toContain(surface);
    }
  });

  it("documents the disclosure instead of quietly dropping the file", () => {
    expect(read("SECURITY.md")).toMatch(/rotated and revoked/);
  });
});

describe("M10 - the signature pad survives a resize", () => {
  it("exports the resize decision so it can be tested", () => {
    const src = read("apps/web/src/components/SignatureCanvas.tsx");
    expect(src).toContain("export function planCanvasResize");
    expect(src).toContain("snapshot");
    // The old handler resized unconditionally on every resize event.
    expect(src).toContain("if (!plan.changed)");
  });
});

describe("M11 - the SPA fallback is cached and does not swallow a 404", () => {
  const filter = "apps/api/src/common/error.filter.ts";

  it("no longer reads index.html synchronously per request", () => {
    const src = read(filter);
    expect(src).not.toContain("readFileSync");
    expect(src).not.toContain("existsSync");
    expect(src).toContain("node:fs/promises");
  });

  it("gates the shell behind an explicit eligibility check", () => {
    const src = read(filter);
    expect(src).toContain("export function isSpaShellCandidate");
    expect(src).toContain("ASSET_LIKE");
    expect(src).toContain("API_PREFIXES");
  });
});

describe("M13 - dates tell the truth about tense and zone", () => {
  const date = "packages/shared/src/date.ts";

  it("stopped clamping the future to zero", () => {
    const src = read(date);
    expect(src).not.toContain("Math.max(0, Math.floor(diffMs / 1000))");
    expect(src).toContain("Math.abs(diffMs)");
    expect(src).toContain("const future = diffMs < 0");
  });

  it("can render in the clinic's zone", () => {
    const src = read(date);
    expect(src).toContain("CLINIC_DEFAULT_TIMEZONE");
    expect(src).toContain("wallClockIn");
    // Must match the clinics.timezone column default.
    expect(src).toContain('"Asia/Tehran"');
  });
});

describe("M18 - fonts are self-hosted", () => {
  const FORBIDDEN_FONT_HOST_STRINGS = [
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "use.typekit.net",
    "fonts.bunny.net",
  ];

  it("makes no third-party font request anywhere in the web app", () => {
    const files = walk("apps/web", [".html", ".css", ".ts", ".tsx", ".webmanifest"]);
    expect(files.length).toBeGreaterThan(0);
    for (const rel of files) {
      const src = read(rel);
      for (const host of FORBIDDEN_FONT_HOST_STRINGS) {
        expect(src.includes(host), `${rel} must not reference a third-party font host (${host})`).toBe(false);
      }
    }
  });

  it("declares exactly two self-hosted families", () => {
    const html = read("apps/web/index.html");
    expect(html.match(/@font-face/g)?.length).toBe(2);
    expect(html).toContain("/fonts/");
    expect(html).toContain("local(");
  });

  it("documents the vendoring step instead of committing binaries", () => {
    expect(has("apps/web/public/fonts/README.md")).toBe(true);
  });

  it("does not name a family nothing loads", () => {
    const tailwind = read("apps/web/tailwind.config.js");
    expect(tailwind).not.toContain("Cormorant Garamond");
    expect(tailwind).not.toContain("Plus Jakarta Sans");
  });
});

describe("M20 - the repository can be picked up by a stranger", () => {
  it("has the files a reader looks for first", () => {
    for (const rel of [
      "README.md",
      "LICENSE",
      "SECURITY.md",
      ".env.example",
      ".github/CODEOWNERS",
      ".github/pull_request_template.md",
      ".github/dependabot.yml",
    ]) {
      expect(has(rel), `${rel} is missing`).toBe(true);
    }
  });

  it("states the non-diagnostic scope where a lawyer would look", () => {
    expect(read("LICENSE")).toContain("NOT A MEDICAL DEVICE");
    expect(read("README.md")).toContain("non-diagnostic");
  });

  it("tells a reporter not to open a public issue", () => {
    expect(read("SECURITY.md")).toMatch(/Do not open a public issue/i);
  });

  it("documents npm as the only package manager", () => {
    expect(read("README.md")).toContain("npm ci");
  });
});

/**
 * M4/M16 (ADR-0044). Phase 5 built the package-call-site rule and then
 * registered the two packages it caught in exceptions.json, because deleting
 * them touches package.json and the lockfile gate refuses a hand edit. An
 * exception with an ADR is honest bookkeeping, not a fix. These assertions make
 * the deletion the permanent state.
 */
describe("M4/M16 - dead weight is deleted, not registered", () => {
  it("has no scaffold package left", () => {
    for (const rel of ["packages/ui", "packages/notify"]) {
      expect(has(rel), `${rel} must be deleted, not exempted`).toBe(false);
    }
  });

  it("keeps exactly one audit anchor implementation", () => {
    // The ops/ copy hashed concatenated row hashes and called it a Merkle root,
    // and its chain verifier never recomputed a row hash - the two claims H17
    // was raised against. Keeping a weaker copy of a security primitive next to
    // the real one is an invitation to import the wrong one.
    expect(has("ops/audit-anchor.ts"), "the pre-phase-6 duplicate must stay deleted").toBe(false);
    expect(has("packages/db/src/audit-anchor.ts")).toBe(true);
    expect(read("packages/db/src/audit-anchor.ts")).toContain("AuditAnchorError");
  });

  it("has no root src/ tree outside the workspace layout", () => {
    // Workspaces are apps/*, packages/*, tools/*. The old root src/assets/images
    // held 6.0MB of JPEGs nothing referenced.
    expect(has("src"), "the repository root has no src/").toBe(false);
  });

  it("stopped exempting the packages it just deleted", () => {
    const parsed = JSON.parse(read("tools/conformance/exceptions.json")) as {
      exceptions: { rule?: string; file?: string }[];
    };
    expect(
      parsed.exceptions.some((e) => e.rule === "package-call-site"),
      "package-call-site must pass on merit, with no registered exception",
    ).toBe(false);
    for (const gone of ["packages/ui", "packages/notify"]) {
      expect(parsed.exceptions.some((e) => (e.file ?? "").startsWith(gone))).toBe(false);
    }
  });

  it("keeps the generated graph consistent with the tree", () => {
    const graph = JSON.parse(read("tools/graph/project-graph.json")) as {
      modules: { name: string; dir: string }[];
      counts: { packages: number };
    };
    for (const mod of graph.modules) {
      expect(has(mod.dir), `${mod.name} is in the graph but ${mod.dir} does not exist`).toBe(true);
    }
    const packages = graph.modules.filter((m) => m.dir.startsWith("packages/"));
    expect(graph.counts.packages).toBe(packages.length);
  });
});

/**
 * R14 (ADR-0044). A workspace root has no runtime. These assert the RULE rather
 * than the current snapshot: npm hoisting will happily resolve an undeclared
 * import, which is exactly why three/lucide-react survived in the root manifest
 * unnoticed while apps/web built against versions it never declared.
 */
describe("R14 - dependencies live in the workspace that uses them", () => {
  const ROOT_MANIFEST = "package.json";
  const WEB_MANIFEST = "apps/web/package.json";

  it("declares no runtime dependency at the workspace root", () => {
    const deps = manifest(ROOT_MANIFEST).dependencies ?? {};
    expect(Object.keys(deps), "a workspace container has no runtime").toEqual([]);
  });

  it("moved every former root runtime package to apps/web", () => {
    const deps = manifest(WEB_MANIFEST).dependencies ?? {};
    for (const name of ["three", "lucide-react", "react", "react-dom"]) {
      expect(deps[name], `apps/web must declare ${name} itself`).toBeTruthy();
    }
  });

  it("keeps @types/three beside its subject", () => {
    expect(manifest(WEB_MANIFEST).devDependencies?.["@types/three"]).toBeTruthy();
    expect(manifest(ROOT_MANIFEST).devDependencies?.["@types/three"]).toBeUndefined();
  });

  it("keeps the coverage provider a dev dependency", () => {
    // It was in "dependencies": a production shipping decision nobody made.
    expect(manifest(ROOT_MANIFEST).devDependencies?.["@vitest/coverage-v8"]).toBeTruthy();
  });

  it("has one jsdom, owned by the root test runner", () => {
    expect(manifest(ROOT_MANIFEST).devDependencies?.jsdom).toBeTruthy();
    expect(
      manifest(WEB_MANIFEST).devDependencies?.jsdom,
      "vitest runs from the root; a second major of jsdom in the app is drift",
    ).toBeUndefined();
  });

  it("proves no workspace other than apps/web imports what only apps/web declares", () => {
    const WEB_ONLY = /from\s+["'](?:three|lucide-react)(?:\/[^"']*)?["']|import\(\s*["'](?:three|lucide-react)/;
    for (const scope of ["apps/api", "apps/admin", "apps/portal", "apps/desktop", "packages"]) {
      for (const rel of walk(scope, [".ts", ".tsx"])) {
        expect(
          WEB_ONLY.test(read(rel)),
          `${rel} imports a package only apps/web declares - declare it in that workspace instead of relying on hoisting`,
        ).toBe(false);
      }
    }
  });

  it("declares a workspace dependency for every internal import in apps/web", () => {
    const deps = manifest(WEB_MANIFEST).dependencies ?? {};
    const internal = new Set<string>();
    for (const rel of walk("apps/web/src", [".ts", ".tsx"])) {
      for (const m of read(rel).matchAll(/from\s+["'](@scalpai\/[a-z-]+)(?:\/[^"']*)?["']/g)) {
        internal.add(m[1]!);
      }
    }
    for (const name of internal) {
      expect(deps[name], `apps/web imports ${name} without declaring it`).toBeTruthy();
    }
  });
});

describe("phase 10 bookkeeping is honest", () => {
  it("drops the exceptions this phase actually resolved", () => {
    const raw = read("tools/conformance/exceptions.json");
    const parsed = JSON.parse(raw) as { exceptions: { file?: string; adr: string }[] };
    const files = parsed.exceptions.map((e) => e.file ?? "");
    expect(files.some((f) => f.includes("LicenseDiagnosticsModal"))).toBe(false);
    expect(files.some((f) => f.includes("packages/licensing"))).toBe(false);
  });

  it("keeps every remaining exception pointed at a real ADR", () => {
    const parsed = JSON.parse(read("tools/conformance/exceptions.json")) as {
      exceptions: { adr: string }[];
    };
    for (const entry of parsed.exceptions) {
      expect(entry.adr).toMatch(/^ADR-\d{3,4}$/);
      expect(has(`docs/adr`)).toBe(true);
    }
  });

  it("records the decisions in an ADR that also names what stayed open", () => {
    const adr = read("docs/adr/ADR-0043-phase10-product-quality.md");
    expect(adr).toContain("What this phase did NOT close");
    for (const open of ["M1", "M5", "L2", "R14", "M19"]) {
      expect(adr).toContain(open);
    }
  });

  it("records batch 2 in its own ADR rather than editing history", () => {
    expect(has("docs/adr/ADR-0044-phase10-debt-removal.md")).toBe(true);
    const adr = read("docs/adr/ADR-0044-phase10-debt-removal.md");
    expect(adr).toContain("Weaknesses addressed:");
    // It must name what it did NOT close, same rule as ADR-0043.
    for (const open of ["M1", "M14", "M15", "L1", "L2"]) {
      expect(adr, `ADR-0044 must still name ${open} as open`).toContain(open);
    }
    // The lockfile gate is the reason this batch exists - it must say so.
    expect(adr).toContain("package-lock.json");
  });

  it("ticks a phase-10 box only when this file has an assertion behind it", () => {
    const phase = read(PHASE_FILE);
    const start = phase.indexOf(PHASE_10_HEADING);
    const end = phase.indexOf(PHASE_SUMMARY_HEADING);
    expect(start, "phase 10 heading not found").toBeGreaterThan(-1);
    expect(end, "phase summary must follow the phase 10 section").toBeGreaterThan(start);
    const openCount = (phase.slice(start, end).match(/^- \[ \] /gm) ?? []).length;
    // M1, M14, M15, L2, L1/W01/W22/W23.
    expect(openCount, "an item was ticked or added without updating this gate").toBe(5);
  });

  it("keeps the phase-level box open while any item is open", () => {
    const phase = read(PHASE_FILE);
    const summary = phase.slice(phase.indexOf(PHASE_SUMMARY_HEADING));
    expect(summary).toContain(`- [ ] \u0641\u0627\u0632 \u06f1\u06f0:`);
  });
});
