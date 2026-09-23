import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkEntry, checkNativeDeps, fixPlan, imgPlatformPkgs, napiPlatformPkgs, pinFromLock, worstLevel, type NativeEntry } from "./native-doctor.js";

/** Real repo root — this suite doubles as the post-pull guard for this checkout. */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const tempRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "native-doctor-"));
  tempRoots.push(root);
  return root;
}

function consumer(root: string, rel: string): string {
  const dir = join(root, rel);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * A fake napi-style loader: when its platform binary is missing the REAL
 * loaders throw "Cannot find native binding" from require() — long before
 * Node would report a missing module. Healthy = plain exports.
 */
function fakeLoader(root: string, name: string, variant: "healthy" | "no-binding"): void {
  const dir = join(root, "node_modules", ...name.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.js"),
    variant === "healthy"
      ? "module.exports = {};\n"
      : "throw new Error('Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828).');\n",
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, main: "index.js" }));
}

const argon2Entry: NativeEntry = {
  pkg: "@node-rs/argon2",
  consumers: ["apps/api", "packages/db"],
  platformPkg: (os, arch) => napiPlatformPkgs("@node-rs/argon2", os, arch),
};

const swcEntry: NativeEntry = {
  pkg: "@swc/core",
  consumers: ["."],
  platformPkg: (os, arch) => napiPlatformPkgs("@swc/core", os, arch),
};

afterEach(() => {
  tempRoots.length = 0;
});

describe("platform package naming", () => {
  it("napi-rs layout: win32 gets the -msvc suffix", () => {
    expect(napiPlatformPkgs("@node-rs/argon2", "win32", "x64")).toEqual(["@node-rs/argon2-win32-x64-msvc"]);
  });

  it("napi-rs layout: linux offers gnu and musl", () => {
    expect(napiPlatformPkgs("@swc/core", "linux", "x64")).toEqual([
      "@swc/core-linux-x64-gnu",
      "@swc/core-linux-x64-musl",
    ]);
  });

  it("napi-rs layout: darwin is bare", () => {
    expect(napiPlatformPkgs("@swc/core", "darwin", "arm64")).toEqual(["@swc/core-darwin-arm64"]);
  });

  it("sharp @img layout: win32 has no -msvc suffix", () => {
    expect(imgPlatformPkgs("@img/sharp", "win32", "x64")).toEqual(["@img/sharp-win32-x64"]);
  });

  it("sharp @img layout: linux includes the linuxmusl spelling", () => {
    expect(imgPlatformPkgs("@img/sharp", "linux", "x64")).toEqual([
      "@img/sharp-linux-x64",
      "@img/sharp-linuxmusl-x64",
    ]);
  });
});

describe("worstLevel", () => {
  it("is ok with no findings", () => {
    expect(worstLevel([])).toBe("ok");
  });

  it("warn findings alone stay a warning", () => {
    expect(worstLevel([{ level: "warn" } as never])).toBe("warn");
  });

  it("any error finding dominates", () => {
    expect(worstLevel([{ level: "warn" } as never, { level: "error" } as never])).toBe("error");
  });
});

describe("checkEntry (fixtures)", () => {
  it("a healthy loader needs no diagnosis at all", () => {
    const root = fixtureRoot();
    fakeLoader(consumer(root, "apps/api"), "@node-rs/argon2", "healthy");

    expect(checkEntry({ ...argon2Entry, consumers: ["apps/api"] }, root, "win32", "x64")).toEqual([]);
  });

  it("a loader whose binding is gone is the exact failure the doctor exists for", () => {
    const root = fixtureRoot();
    fakeLoader(consumer(root, "apps/api"), "@node-rs/argon2", "no-binding");

    const findings = checkEntry({ ...argon2Entry, consumers: ["apps/api"] }, root, "win32", "x64");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      entry: "@node-rs/argon2",
      consumer: "apps/api",
      kind: "binding-missing",
      level: "error",
      platforms: ["@node-rs/argon2-win32-x64-msvc"],
    });
  });

  it("a missing loader (package pruned) points at the install tree, not a binary", () => {
    const root = fixtureRoot();
    consumer(root, "packages/db");

    const findings = checkEntry({ ...argon2Entry, consumers: ["packages/db"] }, root, "win32", "x64");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ entry: "@node-rs/argon2", consumer: "packages/db", kind: "loader-missing", level: "error" });
  });

  it("a sibling consumer is reported independently of a healthy one", () => {
    const root = fixtureRoot();
    fakeLoader(consumer(root, "apps/api"), "@node-rs/argon2", "healthy");
    consumer(root, "packages/db");

    const findings = checkEntry(argon2Entry, root, "win32", "x64");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.consumer).toBe("packages/db");
  });

  it("the root consumer's binding-missing finding names the root-scope platform package", () => {
    const root = fixtureRoot();
    fakeLoader(consumer(root, "."), "@swc/core", "no-binding");

    const findings = checkEntry(swcEntry, root, "win32", "x64");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.platforms).toEqual(["@swc/core-win32-x64-msvc"]);
  });

  it("on linux the finding offers both gnu and musl candidates", () => {
    const root = fixtureRoot();
    fakeLoader(consumer(root, "packages/db"), "@node-rs/argon2", "no-binding");

    const findings = checkEntry({ ...argon2Entry, consumers: ["packages/db"] }, root, "linux", "x64");
    expect(findings[0]?.platforms).toEqual(["@node-rs/argon2-linux-x64-gnu", "@node-rs/argon2-linux-x64-musl"]);
  });

  it("a warn-only entry (transitive tooling) never fails the doctor", () => {
    const root = fixtureRoot();
    consumer(root, ".");

    const findings = checkEntry(
      { pkg: "esbuild", consumers: ["."], platformPkg: (os, arch) => [`@esbuild/${os}-${arch}`], warnOnly: true },
      root,
      "win32",
      "x64",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.level).toBe("warn");
    expect(worstLevel(findings)).toBe("warn");
  });
});

describe("fixPlan", () => {
  const binding = (platforms: string[], consumer = "apps/api") =>
    ({ level: "error", kind: "binding-missing", consumer, platforms } as never);
  const loaderGone = { level: "error", kind: "loader-missing", consumer: "packages/db" } as never;
  const warn = { level: "warn", kind: "binding-missing", platforms: ["x"] } as never;

  it("no error findings means nothing to fix", () => {
    expect(fixPlan([])).toEqual({ mode: "none" });
    expect(fixPlan([warn])).toEqual({ mode: "none" });
  });

  it("missing binaries heal with one root install of exactly those platform packages", () => {
    expect(fixPlan([binding(["@node-rs/argon2-win32-x64-msvc"])]).mode).toBe("install");
    expect(fixPlan([binding(["@img/sharp-win32-x64"], "apps/api"), binding(["@img/sharp-win32-x64"], "packages/db")])).toEqual({
      mode: "install",
      packages: ["@img/sharp-win32-x64"],
    });
  });

  it("a missing loader means the install tree is incomplete: npm ci, not --no-save patches", () => {
    expect(fixPlan([loaderGone])).toEqual({ mode: "ci" });
    expect(fixPlan([binding(["@img/sharp-win32-x64"]), loaderGone])).toEqual({ mode: "ci" });
  });
});describe("pinFromLock", () => {
  it("pins to the version the lockfile carries (sharp 0.35.3 wants @img 0.35.4)", () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, "package-lock.json"),
      JSON.stringify({ packages: { "node_modules/@img/sharp-win32-x64": { version: "0.35.4" } } }),
    );
    expect(pinFromLock(root, "@img/sharp-win32-x64") ).toBe("@img/sharp-win32-x64@0.35.4");
  });

  it("falls back to the optionalDependencies version map when the platform pkg has no top-level entry (this repo's linux lock)", () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, "package-lock.json"),
      JSON.stringify({
        packages: {
          "apps/api/node_modules/sharp": { version: "0.35.3", optionalDependencies: { "@img/sharp-win32-x64": "0.35.4" } },
        },
      }),
    );
    expect(pinFromLock(root, "@img/sharp-win32-x64")).toBe("@img/sharp-win32-x64@0.35.4");
  });

  it("falls back to a nested lock entry when the platform pkg is not hoisted", () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, "package-lock.json"),
      JSON.stringify({ packages: { "node_modules/packages/db/node_modules/@node-rs/argon2-win32-x64-msvc": { version: "2.2.0" } } }),
    );
    expect(pinFromLock(root, "@node-rs/argon2-win32-x64-msvc")).toBe("@node-rs/argon2-win32-x64-msvc@2.2.0");
  });

  it("without a usable lock it returns the bare package name", () => {
    expect(pinFromLock(fixtureRoot(), "@img/sharp-win32-x64")).toBe("@img/sharp-win32-x64");
  });
});

describe("checkNativeDeps (this checkout)", () => {
  /**
   * The post-pull guard itself: if any native dep cannot load the way vitest
   * and tsc will, the suite fails here with the exact finding — before some
   * unrelated test dies inside @node-rs/argon2 with a bare MODULE_NOT_FOUND.
   */
  it("every native dep loads with its platform binary on this machine", () => {
    expect(checkNativeDeps(repoRoot)).toEqual([]);
  });
});
