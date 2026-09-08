import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Phase 10 M19 regression evidence (ADR-0046).
 *
 * These assertions encode the RULE, not a snapshot: a new workspace that keeps
 * its specs out of the typecheck project, a build project that starts emitting
 * specs into dist, or an ESLint config that quietly drops the type-aware layer
 * all turn this suite red. The compiler errors themselves are proven by
 * `npm run typecheck`; what is proven here is that the switches stay on.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const readJson = <T>(rel: string): T => JSON.parse(read(rel)) as T;

interface Manifest {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TsConfig {
  extends?: string;
  compilerOptions?: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
}

function workspaceProjects(): string[] {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(join(ROOT, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${group}/${entry.name}`)
      .filter((rel) => existsSync(join(ROOT, rel, "tsconfig.json"))),
  );
}

const PROJECTS = workspaceProjects();

describe("M19 - TypeScript strict flags", () => {
  const base = readJson<TsConfig>("tooling/tsconfig/base.json");

  it.each([
    "strict",
    "noUncheckedIndexedAccess",
    "noImplicitOverride",
    "noImplicitReturns",
    "noFallthroughCasesInSwitch",
  ])("the shared base config enables %s", (flag) => {
    expect(base.compilerOptions?.[flag]).toBe(true);
  });

  it.each(["allowUnreachableCode", "allowUnusedLabels"])("the shared base config disables %s", (flag) => {
    expect(base.compilerOptions?.[flag]).toBe(false);
  });

  it("every workspace inherits the base config instead of redefining strictness", () => {
    expect(PROJECTS.length).toBeGreaterThanOrEqual(10);
    for (const project of PROJECTS) {
      const config = readJson<TsConfig>(`${project}/tsconfig.json`);
      expect(config.extends).toContain("tooling/tsconfig/base.json");
      expect(config.compilerOptions?.strict).toBeUndefined();
    }
  });
});

describe("M19 - specs are typechecked without being emitted", () => {
  for (const project of PROJECTS) {
    it(`${project} has a typecheck project that includes its specs`, () => {
      const build = readJson<TsConfig>(`${project}/tsconfig.json`);
      // The BUILD project must keep excluding specs: dist ships sources, not tests.
      expect(build.exclude).toContain("src/**/*.spec.ts");
      expect(build.exclude).toContain("src/**/*.spec.tsx");

      const typecheck = readJson<TsConfig>(`${project}/tsconfig.typecheck.json`);
      expect(typecheck.extends).toBe("./tsconfig.json");
      expect(typecheck.exclude).toEqual([]);
      expect(typecheck.include).toEqual(["src"]);
      expect(typecheck.compilerOptions?.noEmit).toBe(true);

      const manifest = readJson<Manifest>(`${project}/package.json`);
      expect(manifest.scripts?.typecheck).toContain("tsconfig.typecheck.json");
      expect(manifest.scripts?.build ?? "").not.toContain("tsconfig.typecheck.json");
    });
  }

  it("tools, e2e and the root configs live in a project too", () => {
    const repo = readJson<TsConfig>("tsconfig.repo.json");
    expect(repo.compilerOptions?.noEmit).toBe(true);
    expect(repo.include).toContain("tools/**/*.ts");
    expect(repo.include).toContain("e2e/**/*.ts");
    expect(repo.include).toContain("vitest.config.ts");
    expect(repo.include).toContain("playwright.config.ts");
  });

  it("the root typecheck gate runs the workspace projects AND the repo project", () => {
    const root = readJson<Manifest>("package.json");
    expect(root.scripts?.typecheck).toContain("turbo run typecheck");
    expect(root.scripts?.typecheck).toContain("typecheck:repo");
    expect(root.scripts?.["typecheck:repo"]).toContain("tsconfig.repo.json");
  });
});

describe("M19 - type-aware ESLint", () => {
  const config = read("tooling/eslint-config/index.js");

  it.each([
    ["the type-aware preset", "recommendedTypeChecked"],
    ["the TypeScript project service", "projectService"],
    ["no-floating-promises", "@typescript-eslint/no-floating-promises"],
    ["no-misused-promises", "@typescript-eslint/no-misused-promises"],
    ["await-thenable", "@typescript-eslint/await-thenable"],
    ["the hook contract", "react-hooks/rules-of-hooks"],
    ["accessibility rules", "jsx-a11y"],
  ])("wires %s", (_label, needle) => {
    expect(config).toContain(needle);
  });

  it("keeps the type-aware layer scoped to files that belong to a project", () => {
    expect(config).toContain("apps/*/src/**");
    expect(config).toContain("packages/*/src/**");
  });

  it("declares both new plugins in the root manifest", () => {
    const root = readJson<Manifest>("package.json");
    expect(root.devDependencies?.["eslint-plugin-react-hooks"]).toBeTruthy();
    expect(root.devDependencies?.["eslint-plugin-jsx-a11y"]).toBeTruthy();
  });
});
