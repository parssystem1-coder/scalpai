/**
 * ScalpAI Project Graph extractor — phase 0 scaffold (ADR-22).
 *
 * Mechanically parses the workspace and emits PROJECT_GRAPH.md +
 * tools/graph/project-graph.json. Everything is PARSED from source; never
 * hand-edit the outputs. Descriptive only ("what exists") — enforcement is
 * the conformance harness's job (ADR-21).
 *
 * Usage:
 *   pnpm graph                regenerate outputs
 *   pnpm graph -- --check     fail if committed outputs are stale
 *   pnpm graph -- --since HEAD~3   structural diff against an earlier commit
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MD_OUT = join(ROOT, "PROJECT_GRAPH.md");
const JSON_OUT = join(ROOT, "tools", "graph", "project-graph.json");
const JSON_REL = "tools/graph/project-graph.json";
const WORKSPACE_DIRS = ["apps", "packages"];

interface ModuleNode {
  name: string;
  kind: "app" | "package";
  dir: string;
  dependsOn: string[];
}

export interface Graph {
  generatedFrom: { commit: string; dirty: boolean };
  modules: ModuleNode[];
  counts: Record<string, number>;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function listWorkspacesFrom(rootDir: string): ModuleNode[] {
  const out: ModuleNode[] = [];
  for (const kind of WORKSPACE_DIRS) {
    const base = join(rootDir, kind);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const dir = join(base, entry);
      if (!statSync(dir).isDirectory()) continue;
      const pkgPath = join(dir, "package.json");
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = new Set<string>();
      for (const section of [pkg.dependencies, pkg.devDependencies]) {
        for (const dep of Object.keys(section ?? {})) {
          if (dep.startsWith("@scalpai/")) deps.add(dep);
        }
      }
      out.push({
        name: pkg.name ?? entry,
        kind: kind === "apps" ? "app" : "package",
        dir: `${kind}/${entry}`,
        dependsOn: [...deps].sort(),
      });
    }
  }
  return out.sort((a, b) => cmp(a.name, b.name));
}

export const extractWorkspacesFrom = listWorkspacesFrom;

function gitInfo(): { commit: string; dirty: boolean } {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString().trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: "unknown", dirty: false };
  }
}

export function build(): Graph {
  const modules = listWorkspacesFrom(ROOT);
  return {
    generatedFrom: gitInfo(),
    modules,
    counts: {
      apps: modules.filter((m) => m.kind === "app").length,
      packages: modules.filter((m) => m.kind === "package").length,
      dependencyEdges: modules.reduce((n, m) => n + m.dependsOn.length, 0),
    },
  };
}

function render(g: Graph): string {
  const lines: string[] = [
    "# Project Graph",
    "",
    `**Generated** by \`pnpm graph\` from commit \`${g.generatedFrom.commit}\`${g.generatedFrom.dirty ? " (working tree dirty)" : ""}. **Do not hand-edit** — every row is parsed from source.`,
    "",
    "Descriptive only: answers *what exists*. Correctness is the conformance harness's job (ADR-21).",
    "",
    `**At a glance:** ${g.counts.apps} apps · ${g.counts.packages} packages · ${g.counts.dependencyEdges} internal dependency edges`,
    "",
    "## Modules",
    "",
    "| module | kind | dir | depends on |",
    "|---|---|---|---|",
  ];
  for (const m of g.modules) {
    lines.push(`| \`${m.name}\` | ${m.kind} | \`${m.dir}\` | ${m.dependsOn.map((d) => `\`${d}\``).join(", ") || "—"} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function stripGeneratedFrom(g: Graph): Omit<Graph, "generatedFrom"> {
  const { generatedFrom: _g, ...rest } = g;
  return rest;
}

function normalize(s: string): string {
  return s.replaceAll("\r\n", "\n");
}

function checkStale(current: Graph): boolean {
  let stale = false;
  const expectedJson = JSON.stringify(stripGeneratedFrom(current), null, 2);
  const actualRaw = existsSync(JSON_OUT) ? readFileSync(JSON_OUT, "utf8") : "";
  let actualJson = "";
  if (actualRaw) {
    try {
      actualJson = JSON.stringify(stripGeneratedFrom(JSON.parse(actualRaw) as Graph), null, 2);
    } catch {
      actualJson = actualRaw; // unparsable committed JSON is itself stale
    }
  }
  if (expectedJson !== actualJson) {
    console.error(`${JSON_REL} is stale. Run \`pnpm graph\` and commit the result.`);
    stale = true;
  }
  const expectedMd = normalize(render(current).split("\n").filter((l) => !l.startsWith("**Generated**")).join("\n"));
  const actualMd = existsSync(MD_OUT)
    ? normalize(
        readFileSync(MD_OUT, "utf8")
          .split("\n")
          .filter((l) => !l.startsWith("**Generated**"))
          .join("\n"),
      )
    : "";
  if (expectedMd !== actualMd) {
    console.error("PROJECT_GRAPH.md is stale. Run `pnpm graph` and commit the result.");
    stale = true;
  }
  return stale;
}

function diffSince(ref: string, current: Graph): string {
  let previous: Graph;
  try {
    previous = JSON.parse(execFileSync("git", ["show", `${ref}:${JSON_REL}`], { cwd: ROOT }).toString()) as Graph;
  } catch {
    return `No graph snapshot at ${ref}:${JSON_REL} — nothing to compare.\n`;
  }
  const lines: string[] = [`Structural changes since ${ref}:`, ""];
  const names = (g: Graph) => g.modules.map((m) => m.name);
  for (const added of names(current).filter((x) => !names(previous).includes(x))) lines.push(`  + module: ${added}`);
  for (const removed of names(previous).filter((x) => !names(current).includes(x))) lines.push(`  - module: ${removed}`);
  const edges = (g: Graph) => g.modules.flatMap((m) => m.dependsOn.map((d) => `${m.name} -> ${d}`));
  for (const e of edges(current).filter((x) => !edges(previous).includes(x))) lines.push(`  + dependency: ${e}`);
  for (const e of edges(previous).filter((x) => !edges(current).includes(x))) lines.push(`  - dependency: ${e}`);
  if (lines.length === 2) lines.push("  (no structural change)");
  return lines.join("\n") + "\n";
}

function main(): void {
  const args = process.argv.slice(2);
  const graph = build();

  if (args.includes("--check")) {
    process.exit(checkStale(graph) ? 1 : 0);
  }

  const sinceIndex = args.indexOf("--since");
  if (sinceIndex !== -1) {
    const ref = args[sinceIndex + 1];
    if (!ref) {
      console.error("--since needs a git ref, e.g. --since HEAD~3");
      process.exit(1);
    }
    process.stdout.write(diffSince(ref, graph));
    process.exit(0);
  }

  writeFileSync(MD_OUT, render(graph), "utf8");
  writeFileSync(JSON_OUT, JSON.stringify(graph, null, 2) + "\n", "utf8");
  console.log(
    `Project graph written: ${graph.counts.apps} apps, ${graph.counts.packages} packages, ${graph.counts.dependencyEdges} dependency edges.`,
  );
}

const invoked = basename(process.argv[1] ?? "").replace(/\\/g, "/");
if (invoked.endsWith("extract.ts")) {
  main();
}
