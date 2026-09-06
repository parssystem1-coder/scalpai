import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRules } from "./run.js";
import { RULES } from "./rules/index.js";
import { packageCallSite, packageManager, productionMocks } from "./rules/v2.js";

/**
 * ADR-21: a rule without a self-test is a suggestion. Every phase 5 rule proves
 * here that it detects its own violation AND that it stays quiet on a compliant
 * tree - the second half is what keeps the harness usable.
 */
function emptyRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "scalpai-conf-v2-"));
  mkdirSync(join(root, "tools", "conformance"), { recursive: true });
  writeFileSync(join(root, "tools", "conformance", "exceptions.json"), JSON.stringify({ exceptions: [] }), "utf8");
  return root;
}

function writeFile(root: string, rel: string, body: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body, "utf8");
}

function pkg(name: string, deps: Record<string, string> = {}): string {
  return JSON.stringify({ name, version: "0.0.0", dependencies: deps }, null, 2);
}

describe("package-call-site", () => {
  it("flags a workspace package nobody imports or depends on", async () => {
    const root = emptyRepo();
    writeFile(root, "packages/orphan/package.json", pkg("@scalpai/orphan"));
    writeFile(root, "packages/orphan/src/index.ts", "export const unused = 1;\n");

    const res = await runRules([packageCallSite], { root });
    expect(res.violations.map((v) => v.file)).toEqual(["packages/orphan/package.json"]);
  });

  it("accepts a package imported from an app", async () => {
    const root = emptyRepo();
    writeFile(root, "packages/used/package.json", pkg("@scalpai/used"));
    writeFile(root, "packages/used/src/index.ts", "export const used = 1;\n");
    writeFile(root, "apps/api/src/main.ts", 'import { used } from "@scalpai/used";\nexport const x = used;\n');

    const res = await runRules([packageCallSite], { root });
    expect(res.violations).toEqual([]);
  });

  it("accepts a package declared as a dependency of another workspace", async () => {
    const root = emptyRepo();
    writeFile(root, "packages/dep/package.json", pkg("@scalpai/dep"));
    writeFile(root, "apps/web/package.json", pkg("@scalpai/app-web", { "@scalpai/dep": "*" }));

    const res = await runRules([packageCallSite], { root });
    expect(res.violations).toEqual([]);
  });

  it("does not count the package importing itself", async () => {
    const root = emptyRepo();
    writeFile(root, "packages/selfish/package.json", pkg("@scalpai/selfish"));
    writeFile(root, "packages/selfish/src/a.ts", 'import { b } from "@scalpai/selfish";\nexport const a = b;\n');

    const res = await runRules([packageCallSite], { root });
    expect(res.violations.map((v) => v.file)).toEqual(["packages/selfish/package.json"]);
  });
});

describe("production-mocks", () => {
  it("flags SAMPLE_ data on an ungated production path", async () => {
    const root = emptyRepo();
    writeFile(root, "apps/web/src/components/Demo.tsx", "const SAMPLE_PATIENTS = [];\nexport default SAMPLE_PATIENTS;\n");

    const res = await runRules([productionMocks], { root });
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]!.file).toBe("apps/web/src/components/Demo.tsx:1");
  });

  it("accepts the same data behind a dev gate", async () => {
    const root = emptyRepo();
    writeFile(
      root,
      "apps/web/src/components/DevOnly.tsx",
      "const SAMPLE_PATIENTS = [];\nexport const show = () => (import.meta.env.DEV ? SAMPLE_PATIENTS : []);\n",
    );

    const res = await runRules([productionMocks], { root });
    expect(res.violations).toEqual([]);
  });

  it("accepts a driver-gated mock on the server", async () => {
    const root = emptyRepo();
    writeFile(
      root,
      "apps/api/src/media/mock.ts",
      "export const MOCK_MAX_BODY_BYTES = 1;\nexport const on = process.env.STORAGE_DRIVER === 'mock';\n",
    );

    const res = await runRules([productionMocks], { root });
    expect(res.violations).toEqual([]);
  });

  it("ignores specs and test folders", async () => {
    const root = emptyRepo();
    writeFile(root, "apps/api/src/thing.spec.ts", "const MOCK_THING = 1;\nexport default MOCK_THING;\n");
    writeFile(root, "apps/api/test/helper.ts", "export const Mocked = true;\n");

    const res = await runRules([productionMocks], { root });
    expect(res.violations).toEqual([]);
  });
});

describe("package-manager", () => {
  it("flags a pnpm invocation in a workflow and in a script", async () => {
    const root = emptyRepo();
    writeFile(root, ".github/workflows/bad.yml", "jobs:\n  a:\n    steps:\n      - run: pnpm install\n");
    writeFile(root, "tools/bad.sh", "#!/usr/bin/env bash\npnpm run build\n");

    const res = await runRules([packageManager], { root });
    expect(res.violations.map((v) => v.file).sort()).toEqual([".github/workflows/bad.yml:4", "tools/bad.sh:2"]);
  });

  it("flags a pnpm packageManager field", async () => {
    const root = emptyRepo();
    writeFile(root, "package.json", '{\n  "packageManager": "pnpm@9.0.0"\n}\n');

    const res = await runRules([packageManager], { root });
    expect(res.violations).toHaveLength(1);
  });

  it("leaves npm commands and the lockfile name alone", async () => {
    const root = emptyRepo();
    writeFile(root, "package.json", '{\n  "packageManager": "npm@10.9.2",\n  "scripts": { "build": "npm exec -- turbo run build" }\n}\n');
    writeFile(root, "tools/ci/check.sh", "#!/usr/bin/env bash\n# refuse a committed pnpm-lock.yaml\nls pnpm-lock.yaml\n");

    const res = await runRules([packageManager], { root });
    expect(res.violations).toEqual([]);
  });
});

describe("registration", () => {
  it("every phase 5 rule is registered in the harness", () => {
    const names = RULES.map((r) => r.name);
    expect(names).toContain("package-call-site");
    expect(names).toContain("production-mocks");
    expect(names).toContain("package-manager");
  });
});
