// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import i18n from "../i18n.js";

/**
 * M5 quality gate (phase B). A translation bundle rots silently: a key added to
 * fa and forgotten in en only shows up as a fallback string in the English UI,
 * and a key nobody calls anymore is dead weight that still has to be translated.
 *
 * jsdom is required because i18n.ts reads `localStorage` at module load.
 */
type Node = Record<string, unknown>;

type Lang = "fa" | "en";

const bundleOf = (lng: Lang): Node => {
  const raw: unknown = i18n.getResourceBundle(lng, "translation");
  if (raw === null || typeof raw !== "object") {
    throw new Error(`no 'translation' bundle registered for '${lng}'`);
  }
  return raw as Node;
};

/** Every LEAF path, so a nested namespace cannot hide a missing key. */
const leafPaths = (node: unknown, prefix = ""): string[] => {
  if (node === null || typeof node !== "object") return prefix === "" ? [] : [prefix];
  return Object.entries(node as Node).flatMap(([key, value]) =>
    leafPaths(value, prefix === "" ? key : `${prefix}.${key}`)
  );
};

const leafAt = (node: Node, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc !== null && typeof acc === "object" ? (acc as Node)[part] : undefined),
      node
    );

/** `{{patient}}` / `{{value, number}}` -> ["patient"] / ["value"]. */
const placeholdersOf = (value: unknown): string[] =>
  typeof value === "string"
    ? [...value.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1] ?? "").sort()
    : [];

const WEB_SRC = fileURLToPath(new URL("../", import.meta.url));

/**
 * The M5 surface phase A migrated. Kept in step with the
 * `no-persian-literals-in-tsx` conformance scope: both are ratchets that grow as
 * each component moves onto i18n, so the orphan check never reports a key that a
 * not-yet-migrated legacy module is still meant to consume.
 */
const M5_SOURCES: string[] = [
  join(WEB_SRC, "components", "DashboardHeader.tsx"),
  join(WEB_SRC, "components", "DashboardTabs.tsx"),
  join(WEB_SRC, "components", "dashboard-sections.ts"),
  join(WEB_SRC, "components", "sections"),
];

const M5_NAMESPACES = [
  "dashboard.header.",
  "dashboard.tabs.",
  "dashboard.patientList.",
  "dashboard.scalpMap.",
  "dashboard.analytics.",
];

const SOURCE_EXTS = [".ts", ".tsx"];

const filesUnder = (target: string): string[] => {
  if (!statSync(target).isDirectory()) {
    return SOURCE_EXTS.some((ext) => target.endsWith(ext)) ? [target] : [];
  }
  return readdirSync(target).flatMap((entry) => filesUnder(join(target, entry)));
};

/** Literal keys only: a dynamic `t(variable)` cannot be resolved statically. */
const KEY_RE = /(?:\bt\(\s*|labelKey:\s*)"([A-Za-z0-9_.-]+)"/g;

const referencedKeys = (): Set<string> => {
  const keys = new Set<string>();
  for (const file of M5_SOURCES.flatMap(filesUnder)) {
    if (/\.spec\.tsx?$/.test(file)) continue;
    for (const match of readFileSync(file, "utf8").matchAll(KEY_RE)) {
      const key = match[1];
      if (key !== undefined && key.includes(".")) keys.add(key);
    }
  }
  return keys;
};

describe("i18n parity", () => {
  it("has same keys in fa and en", () => {
    const faKeys = Object.keys(bundleOf("fa"));
    const enKeys = Object.keys(bundleOf("en"));

    expect(faKeys.sort()).toEqual(enKeys.sort());
  });

  it("has the same key STRUCTURE in fa and en, all the way down", () => {
    const fa = leafPaths(bundleOf("fa")).sort();
    const en = leafPaths(bundleOf("en")).sort();

    expect(fa.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !fa.includes(k))).toEqual([]);
    expect(fa).toEqual(en);
  });

  it("resolves every leaf to a string in both languages", () => {
    const fa = bundleOf("fa");
    const en = bundleOf("en");

    const nonStrings = leafPaths(fa).filter(
      (path) => typeof leafAt(fa, path) !== "string" || typeof leafAt(en, path) !== "string"
    );

    expect(nonStrings).toEqual([]);
  });

  it("keeps interpolation placeholders in sync", () => {
    const fa = bundleOf("fa");
    const en = bundleOf("en");

    const drifted = leafPaths(fa).filter(
      (path) =>
        placeholdersOf(leafAt(fa, path)).join(",") !== placeholdersOf(leafAt(en, path)).join(",")
    );

    expect(drifted).toEqual([]);
  });

  it("has no orphan keys", () => {
    const fa = bundleOf("fa");
    const referenced = referencedKeys();

    // A key in an M5 namespace that no migrated component asks for anymore.
    const orphans = leafPaths(fa)
      .filter((path) => M5_NAMESPACES.some((ns) => path.startsWith(ns)))
      .filter((path) => !referenced.has(path));

    expect(orphans).toEqual([]);
  });

  it("has no dangling references: every key the M5 surface calls exists in fa and en", () => {
    const fa = bundleOf("fa");
    const en = bundleOf("en");
    const referenced = [...referencedKeys()].sort();

    expect(referenced.length).toBeGreaterThan(0);
    expect(referenced.filter((key) => typeof leafAt(fa, key) !== "string")).toEqual([]);
    expect(referenced.filter((key) => typeof leafAt(en, key) !== "string")).toEqual([]);
  });
});
