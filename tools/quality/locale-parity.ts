/**
 * locale-parity gate (P4 remediation — Wave 3).
 *
 * The previous "parity" story was a file-inventory check; it could not see
 * what a user actually gets. This gate parses apps/web translation bundles
 * with the REAL TypeScript compiler (no regex parsing of object literals —
 * a hand-rolled parser is exactly the class of silent wrongness this project
 * keeps finding) and, for every `t("<key>")` literal found in apps/web
 * source, requires the key to resolve in BOTH locales. A key present only in
 * fa renders as its raw key for the English user — the exact class of bug
 * the dashboard.dividers.patients incident exposed.
 *
 * Sources of bundle keys (all TS-parsed):
 *   - `const fa = {...}` / `const en = {...}` in apps/web/src/i18n.ts
 *   - every `i18n.addResourceBundle("<lng>", "translation", {...})` call in apps/web/src
 *
 * Exit 0 = every used key resolves in both locales. Any miss lists the key,
 * the locales missing it and the files that use it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const WEB_SRC = join(process.cwd(), "apps", "web", "src");

interface Violation {
  key: string;
  missingIn: string[];
  usedIn: string[];
}

/** Dotted paths of every leaf under an object-literal AST node. */
function collectLeafKeys(node: ts.ObjectLiteralExpression): Set<string> {
  const keys = new Set<string>();
  const visit = (obj: ts.ObjectLiteralExpression, prefix: string): void => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
      const nameNode = prop.name;
      let name: string;
      if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) {
        name = nameNode.text;
      } else {
        continue; // computed/odd key — the runtime would need it explicitly too
      }
      const path = prefix ? `${prefix}.${name}` : name;
      const initializer = ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
      if (initializer !== undefined && ts.isObjectLiteralExpression(initializer)) {
        visit(initializer, path);
        keys.add(path); // parents resolve as i18next fallback namespaces
      } else {
        keys.add(path);
      }
    }
  };
  visit(node, "");
  return keys;
}

/** First language-literal argument of a call, or null. */
function stringArg(call: ts.CallExpression, index: number): string | null {
  const arg = call.arguments[index];
  return arg && ts.isStringLiteral(arg) ? arg.text : null;
}

/** Parse one TS/TSX source and merge its addResourceBundle keys into the locales.
 *  `constMap` resolves shorthand-style references like `{ inbox: fa }` where `fa`
 *  is a module-level object literal in the same file. */
function harvestResourceBundles(
  sourceFile: ts.SourceFile,
  bundles: Map<string, Set<string>>,
  constMap: Map<string, ts.ObjectLiteralExpression>,
): void {
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const text = node.expression.getText(sourceFile);
      if (text.endsWith("addResourceBundle")) {
        const lng = stringArg(node, 0);
        const third = node.arguments[2];
        if (lng && third && ts.isObjectLiteralExpression(third)) {
          const keys = new Set<string>();
          for (const prop of third.properties) {
            if (!ts.isPropertyAssignment(prop)) continue;
            if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
            const segment = prop.name.text;
            const init: ts.Expression | undefined = ts.isPropertyAssignment(prop)
              ? prop.initializer
              : undefined;
            if (init === undefined) {
              keys.add(segment);
            } else if (ts.isObjectLiteralExpression(init)) {
              for (const key of collectLeafKeys(init)) keys.add(`${segment}.${key}`);
            } else if (ts.isIdentifier(init) && constMap.has(init.text)) {
              // { inbox: fa } — descend into the referenced literal
              for (const key of collectLeafKeys(constMap.get(init.text) as ts.ObjectLiteralExpression)) {
                keys.add(`${segment}.${key}`);
              }
            } else {
              keys.add(segment);
            }
          }
          const existing = bundles.get(lng) ?? new Set<string>();
          for (const key of keys) existing.add(key);
          bundles.set(lng, existing);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/** Module-level `const <name> = {…}` object literals of one file (for reference resolution). */
function collectModuleConstLiterals(sourceFile: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const map = new Map<string, ts.ObjectLiteralExpression>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
        map.set(decl.name.text, decl.initializer);
      }
    }
  }
  return map;
}

/** `const fa = {…}` / `const en = {…}` bundle objects in i18n.ts. */
function harvestConstBundles(sourceFile: ts.SourceFile, bundles: Map<string, Set<string>>): void {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const name = decl.name.text;
      if ((name === "fa" || name === "en") && ts.isObjectLiteralExpression(decl.initializer)) {
        const keys = collectLeafKeys(decl.initializer);
        const existing = bundles.get(name) ?? new Set<string>();
        for (const key of keys) existing.add(key);
        bundles.set(name, existing);
      }
    }
  }
}

/** Collect t("<literal>") keys from app source (skip __tests__). */
function collectUsedKeys(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        const source = readFileSync(full, "utf8");
        const re = /\b(?:i18n\.)?t\(\s*["'`]([A-Za-z][\w.-]*)["'`]/g;
        for (const match of source.matchAll(re)) {
          const key = match[1];
          if (key === undefined) continue; // group always matches, but noUncheckedIndexedAccess demands the guard
          const files = used.get(key) ?? new Set<string>();
          files.add(full.slice(WEB_SRC.length + 1));
          used.set(key, files);
        }
      }
    }
  };
  walk(WEB_SRC);
  return used;
}

function main(): number {
  const bundles = new Map<string, Set<string>>();

  const i18nSource = readFileSync(join(WEB_SRC, "i18n.ts"), "utf8");
  const i18nFile = ts.createSourceFile("i18n.ts", i18nSource, ts.ScriptTarget.Latest, true);
  harvestConstBundles(i18nFile, bundles);

  // Every other file may register bundles via addResourceBundle (e.g. inbox.i18n.ts).
  const walkAll = (dir: string, visit: (file: string) => void): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walkAll(full, visit);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        visit(full);
      }
    }
  };
  walkAll(WEB_SRC, (file) => {
    const source = readFileSync(file, "utf8");
    if (!source.includes("addResourceBundle")) return;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    harvestResourceBundles(sf, bundles, collectModuleConstLiterals(sf));
  });

  const violations: Violation[] = [];
  for (const [key, files] of collectUsedKeys()) {
    const missingIn: string[] = [];
    for (const lng of ["fa", "en"]) {
      if (!bundles.get(lng)?.has(key)) missingIn.push(lng);
    }
    if (missingIn.length > 0) violations.push({ key, missingIn, usedIn: [...files] });
  }

  if (violations.length > 0) {
    console.error(`locale-parity: FAIL (${violations.length} key(s) do not resolve in both locales)`);
    for (const v of violations) {
      console.error(`  ${v.key} — missing in ${v.missingIn.join(", ")} — used in ${v.usedIn.join(", ")}`);
    }
    return 1;
  }

  const faCount = bundles.get("fa")?.size ?? 0;
  const enCount = bundles.get("en")?.size ?? 0;
  console.log(`locale-parity: PASS (fa: ${faCount} keys, en: ${enCount} keys, all used keys resolve in both)`);
  return 0;
}

process.exit(main());
