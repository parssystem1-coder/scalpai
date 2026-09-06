import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type Graph } from "./extract.js";
import { execFileSync } from "node:child_process";

/** build() reads ROOT-relative paths — for unit tests we exercise the pure parts via a fixture repo. */
function makeFixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "scalpai-graph-"));
  for (const ws of ["apps", "packages"]) {
    for (const name of ws === "apps" ? ["web"] : ["shared", "db"]) {
      const dir = join(root, ws, name);
      mkdirSync(dir, { recursive: true });
      const deps = name === "web" ? { "@scalpai/shared": "workspace:*" } : {};
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: `@scalpai/${name}`, dependencies: deps }),
        "utf8",
      );
    }
  }
  return root;
}

describe("project graph extractor (v0)", () => {
  it("discovers workspaces and internal dependency edges", async () => {
    const { extractWorkspacesFrom } = await import("./extract.js");
    const mods = extractWorkspacesFrom(makeFixtureRepo());
    expect(mods.map((m) => m.name).sort()).toEqual(["@scalpai/db", "@scalpai/shared", "@scalpai/web"]);
    const web = mods.find((m) => m.name === "@scalpai/web");
    expect(web?.dependsOn).toEqual(["@scalpai/shared"]);
  });

  it("counts are consistent with module list in the real repo", () => {
    const g = build();
    expect(g.counts.apps).toBe(5);
    expect(g.counts.packages).toBe(9);
    expect(g.modules).toHaveLength(g.counts.apps + g.counts.packages);
  });

  it("git info reports the current commit", () => {
    let sha = "unknown";
    try {
      sha = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
    } catch {
      // safe fallback in environments without .git metadata
    }
    const g: Graph = build();
    expect(g.generatedFrom.commit).toBe(sha);
  });
});
