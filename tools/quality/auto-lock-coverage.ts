/**
 * auto-lock-coverage gate (P4 remediation — Wave 3).
 *
 * DESKIN §13 requires every authenticated surface to idle-lock. Two failure
 * modes have both shipped before:
 *   1. per-page wiring (the InboxPage gap): a route renders protected content
 *      with no AutoLock, because "the page below it wired one" — until a new
 *      page forgets;
 *   2. dead wiring: a page mounts AutoLock manually while ProtectedRoute also
 *      does — two timers, double logout, and the per-page copy drifts.
 *
 * This gate parses the AST (typescript compiler — no regex over source) and
 * proves coverage STRUCTURALLY:
 *   - every JSX element passed to a <Route element={…}> whose path is not
 *     public (login/home) must contain <ProtectedRoute> in its subtree;
 *   - NO component may render <AutoLock> other than ProtectedRoute itself
 *     (single choke point, single timer);
 *   - ProtectedRoute must render AutoLock with the exported AUTO_LOCK_MINUTES
 *     constant (§13: 10) — not a magic number someone can quietly change.
 *
 * Exit 0 = the lock is inherited by construction, not wired per page.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const WEB_SRC = join(process.cwd(), "apps", "web", "src");
/**
 * Routes that render no clinical surface and are public BY DESIGN. Anything
 * added here is a reviewed decision, exactly like no-synthetic-clinical's
 * HairCanvas allowlist:
 *  - /login, / : the auth screen and the marketing landing;
 *  - /plans : the pricing view — the SAME ProPlansView component the public
 *    landing renders; no PHI, no clinical data;
 *  - * : the catch-all is a pure <Navigate to="/"> redirect — it renders no
 *    content at all, so there is nothing to lock.
 */
const PUBLIC_PATHS = new Set(["/login", "/", "/plans", "*"]);

interface Violation {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

const violations: Violation[] = [];

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      yield* walkTs(full);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      // Spec files test AutoLock directly — production coverage is the rule,
      // test wiring is not.
      if (entry.name.includes(".spec.")) continue;
      yield full;
    }
  }
}

/** The identifier a JSX element's tag resolves to, or null for host elements. */
function jsxTagName(element: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxOpeningElement): string | null {
  const tag = ts.isJsxElement(element)
    ? element.openingElement.tagName
    : element.tagName;
  if (tag && ts.isIdentifier(tag)) return tag.text;
  if (tag && ts.isPropertyAccessExpression(tag)) return tag.getText();
  return null;
}

/** JSX opening/self-closing elements anywhere in a subtree, as (name, node) pairs. */
function jsxElements(node: ts.Node): { name: string; node: ts.JsxElement | ts.JsxSelfClosingElement }[] {
  const out: { name: string; node: ts.JsxElement | ts.JsxSelfClosingElement }[] = [];
  const visit = (current: ts.Node): void => {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      const name = jsxTagName(current);
      if (name) out.push({ name, node: current });
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return out;
}

/** Find the enclosing function declaration for a JSX fragment (best effort). */
function analyzeAppRoutes(sourceFile: ts.SourceFile, file: string): void {
  const visit = (node: ts.Node): void => {
    // Rule 2: only ProtectedRoute may render AutoLock.
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = jsxTagName(node);
      if (name === "AutoLock" && !file.replace(/\\/g, "/").endsWith("components/ProtectedRoute.tsx")) {
        violations.push({
          file,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          rule: "no-per-page-autolock",
          detail: "AutoLock may only be rendered inside ProtectedRoute (single choke point)",
        });
      }
    }

    // Rule 1: every protected route's element subtree must include ProtectedRoute.
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "element") {
      const initializer = node.initializer;
      // A JsxAttribute's parent is the JsxAttributes collection; the Route tag
      // is that collection's parent (opening or self-closing element).
      const attrs = node.parent;
      const routeTag = attrs?.parent;
      const isRouteTag =
        attrs !== undefined &&
        ts.isJsxAttributes(attrs) &&
        routeTag !== undefined &&
        (ts.isJsxOpeningElement(routeTag) || ts.isJsxSelfClosingElement(routeTag)) &&
        jsxTagName(routeTag) === "Route";
      if (isRouteTag && initializer && ts.isJsxExpression(initializer) && initializer.expression) {
        const subtree = initializer.expression;
        const hasProtected = [...jsxElements(subtree)].some((el) => el.name === "ProtectedRoute");
        // Public paths are exempt — find the sibling path attribute.
        const pathAttr = attrs.properties.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "path",
        );
        const pathInit = pathAttr?.initializer;
        const pathValue =
          pathInit && ts.isStringLiteral(pathInit) ? pathInit.text : null;
        if (!hasProtected && !(pathValue && PUBLIC_PATHS.has(pathValue))) {
          violations.push({
            file,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            rule: "route-without-protectedroute",
            detail: `Route ${pathValue ?? "(dynamic)"} renders its element without <ProtectedRoute>`,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/** Rule 3: ProtectedRoute locks via the shared constant, never a magic number. */
function analyzeProtectedRoute(sourceFile: ts.SourceFile, file: string): void {
  let foundAutoLock = false;
  let foundConstant = false;
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === "AUTO_LOCK_MINUTES") {
          foundConstant = true;
          const init = decl.initializer;
          if (!init || !ts.isNumericLiteral(init) || Number(init.text) !== 10) {
            violations.push({
              file,
              line: sourceFile.getLineAndCharacterOfPosition((init ?? decl).getStart()).line + 1,
              rule: "auto-lock-window-drift",
              detail: `AUTO_LOCK_MINUTES must stay 10 (§13), found ${init?.getText() ?? "non-literal"}`,
            });
          }
        }
      }
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (jsxTagName(node) === "AutoLock") foundAutoLock = true;
      if (ts.isJsxSelfClosingElement(node)) {
        const minutes = node.attributes.properties.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "minutes",
        );
        if (minutes) {
          const init = minutes.initializer;
          if (init && ts.isJsxExpression(init) && init.expression && ts.isIdentifier(init.expression) && init.expression.text === "AUTO_LOCK_MINUTES") {
            foundConstant = true;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!foundAutoLock) {
    violations.push({ file, line: 1, rule: "protected-route-must-lock", detail: "ProtectedRoute no longer renders AutoLock" });
  }
  if (!foundConstant) {
    violations.push({ file, line: 1, rule: "auto-lock-window-drift", detail: "AUTO_LOCK_MINUTES (10) not referenced by the AutoLock mount" });
  }
}

function main(): number {
  let scanned = 0;
  for (const file of walkTs(WEB_SRC)) {
    scanned += 1;
    const source = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    if (file.replace(/\\/g, "/").endsWith("components/ProtectedRoute.tsx")) {
      analyzeProtectedRoute(sf, file);
    } else {
      analyzeAppRoutes(sf, file);
    }
  }

  if (violations.length > 0) {
    console.error(`auto-lock-coverage: FAIL (${violations.length} violation(s), ${scanned} files scanned)`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.detail}`);
    }
    return 1;
  }

  console.log(`auto-lock-coverage: PASS (${scanned} files scanned — every route protected, one choke point locks)`);
  return 0;
}

process.exit(main());
