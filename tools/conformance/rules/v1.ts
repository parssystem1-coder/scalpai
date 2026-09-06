import { join } from "node:path";
import { statSync } from "node:fs";
import type { Rule, RuleContext, Violation } from "../lib/types.js";
import { listFiles, readRoot } from "../lib/walk.js";

const SQL_SCOPE = join("packages", "db", "sql");
const DB_INDEX = "packages/db/src/index.ts";

interface SqlTable {
  table: string;
  file: string;
  body: string;
}

interface SqlIndex {
  allSql: string;
  tables: SqlTable[];
}

/**
 * The table inventory is DERIVED from the migrations (WEAKNESSES C5/M14): no
 * hardcoded RLS_TABLES list to forget, and no hardcoded EXEMPT_TABLES to hide
 * behind. A table is exempt only through tools/conformance/exceptions.json,
 * which refuses entries without a registered ADR reference.
 */
function indexSql(root: string): SqlIndex {
  const files = listFiles(root, SQL_SCOPE, [".sql"]);
  const tables: SqlTable[] = [];
  const texts: string[] = [];
  for (const f of files) {
    const sqlText = readRoot(root, f);
    texts.push(sqlText);
    for (const m of sqlText.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
      const open = sqlText.indexOf("(", m.index);
      let depth = 0;
      let close = open;
      for (let i = open; i < sqlText.length; i++) {
        if (sqlText[i] === "(") depth++;
        else if (sqlText[i] === ")") {
          depth--;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      tables.push({ table: m[1]!, file: f, body: sqlText.slice(open, close) });
    }
  }
  return { allSql: texts.join("\n"), tables };
}

/** engineering-rules §1 + §4: business tables need clinic_id + RLS ENABLE/FORCE (ADR-0003). */
export const tenantSafety: Rule = {
  name: "tenant-safety",
  source: "§1/§4",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const { tables, allSql } = indexSql(ctx.root);

    for (const { table, file, body } of tables) {
      // the column may be introduced by a later migration (ALTER TABLE … ADD COLUMN)
      const addedLater = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN[^;]*\\bclinic_id\\b`, "i");
      if (!/\bclinic_id\b/.test(body) && !addedLater.test(allSql)) {
        out.push({
          rule: this.name,
          file: `${file}:${table}`,
          message: `جدول business '${table}' ستون clinic_id ندارد`,
          fix: "clinic_id uuid NOT NULL REFERENCES clinics(id) اضافه کنید یا با ADR در exceptions.json مستثنا کنید",
        });
      }
    }

    // global RLS posture for every table the migrations create
    const seen = new Set<string>();
    for (const { table } of tables) {
      if (seen.has(table)) continue;
      seen.add(table);
      const enableRe = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      const forceRe = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      if (!enableRe.test(allSql)) {
        out.push({ rule: this.name, file: `sql:${table}`, message: `RLS روی '${table}' فعال نیست`, fix: "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" });
      }
      if (!forceRe.test(allSql)) {
        out.push({ rule: this.name, file: `sql:${table}`, message: `FORCE RLS روی '${table}' نیست`, fix: "ALTER TABLE ... FORCE ROW LEVEL SECURITY" });
      }
    }
    return out;
  },
};

/** engineering-rules §1: only packages/db may touch pg/drizzle directly. */
export const dbAccess: Rule = {
  name: "db-access",
  source: "§1",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const scope of ["apps", "packages"]) {
      for (const f of listFiles(ctx.root, scope, [".ts"])) {
        if (f.startsWith("packages/db/")) continue;
        const src = readRoot(ctx.root, f);
        for (const m of src.matchAll(/from\s+["'](pg|drizzle-orm[^"']*)["']/g)) {
          out.push({
            rule: this.name,
            file: f,
            message: `import مستقیم '${m[1]}' خارج از packages/db`,
            fix: "دسترسی داده فقط از طریق repos/packages/db (rules §1)",
          });
        }
      }
    }
    return out;
  },
};

/** engineering-rules §2: PHI must never reach logs — server AND client (M14). */
export const phiLogs: Rule = {
  name: "phi-logs",
  source: "§2",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const scope of ["apps", "packages"]) {
      for (const f of listFiles(ctx.root, scope, [".ts", ".tsx"])) {
        if (f.endsWith(".spec.ts") || f.endsWith(".spec.tsx")) continue;
        const lines = readRoot(ctx.root, f).split("\n");
        lines.forEach((line, i) => {
          if (/(console\.(log|error|warn)|logger\.\w+)\s*\(/.test(line) && /(phone|password|refreshToken|nationalId|notes)/i.test(line)) {
            out.push({
              rule: this.name,
              file: `${f}:${i + 1}`,
              message: "احتمال نشت PHI به لاگ",
              fix: "فقط شناسه‌ها لاگ شوند؛ مقدار حساس حذف شود",
            });
          }
        });
      }
    }
    return out;
  },
};

/**
 * engineering-rules §5: no hardcoded credentials in source. Phase 2 (M14) widens
 * the sweep beyond `.ts` — `.tsx`, `ops/`, tooling and JSON/YAML are exactly
 * where committed keys have historically hidden.
 */
export const secrets: Rule = {
  name: "secrets",
  source: "§5",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const exts = [".ts", ".tsx", ".json", ".yml", ".yaml"];
    const scopes = ["apps", "packages", "ops", "tools", "e2e"];
    const rootFiles = ["vercel.json", "metadata.json", "firebase-applet-config.json", "turbo.json"];
    const files = [
      ...scopes.flatMap((s) => listFiles(ctx.root, s, exts)),
      ...rootFiles.filter((f) => existsRoot(ctx.root, f)),
    ];
    for (const rel of files) {
      if (rel.endsWith(".spec.ts") || rel.endsWith(".spec.tsx")) continue;
      const lines = readRoot(ctx.root, rel).split("\n");
      lines.forEach((line, i) => {
        if (/dev_only/i.test(line)) return;
        if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
          out.push({ rule: this.name, file: `${rel}:${i + 1}`, message: "کلید خصوصی در سورس", fix: "secret فقط env" });
        }
        if (/\bAKIA[0-9A-Z]{16}\b/.test(line)) {
          out.push({ rule: this.name, file: `${rel}:${i + 1}`, message: "AWS key در سورس", fix: "secret فقط env" });
        }
        if (/\bghp_[A-Za-z0-9]{36}\b/.test(line)) {
          out.push({ rule: this.name, file: `${rel}:${i + 1}`, message: "GitHub token در سورس", fix: "secret فقط env" });
        }
      });
    }
    return out;
  },
};

/** engineering-rules §3: one error shape, registered globally. */
export const errorContract: Rule = {
  name: "error-contract",
  source: "§3",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    let okFilter = false;
    let okModule = false;
    try {
      okFilter = /class AllExceptionsFilter/.test(readRoot(ctx.root, "apps/api/src/common/error.filter.ts"));
      okModule = /APP_FILTER/.test(readRoot(ctx.root, "apps/api/src/app.module.ts"));
    } catch {
      /* files optional at phase 0 */
    }
    if (!okFilter || !okModule) {
      out.push({
        rule: this.name,
        file: okFilter ? "apps/api/src/app.module.ts" : filterRel(),
        message: "شکل ثابت خطا یا ثبت سراسری فیلتر یافت نشد",
        fix: "AllExceptionsFilter + APP_FILTER در AppModule (قواعد §3)",
      });
    }
    return out;
  },
};

function filterRel(): string {
  return "apps/api/src/common/error.filter.ts";
}

/**
 * engineering-rules §9.1: EVERY endpoint must declare its gate.
 * Phase 2 (M14) extends the rule from mutations to reads: a PHI GET without an
 * explicit @Roles/@RequireFeature/@Public is exactly how a role matrix rots.
 */
export const featureGate: Rule = {
  name: "feature-gate",
  source: "§9.1",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const f of listFiles(ctx.root, "apps/api/src", [".controller.ts"])) {
      const isAuthPublic = f.includes("auth/");
      const src = readRoot(ctx.root, f).split("\n");
      src.forEach((line, i) => {
        if (!/^@\s*(Get|Post|Put|Patch|Delete)\b/.test(line.trim())) return;
        const window = [...src.slice(Math.max(0, i - 6), i), ...src.slice(i + 1, i + 7)].join("\n");
        if (!/@RequireFeature\(|@Roles\(|@Public\(/.test(window) && !isAuthPublic) {
          out.push({
            rule: this.name,
            file: `${f}:${i + 1}`,
            message: "endpoint بدون @RequireFeature/@Roles/@Public",
            fix: "نقش یا فیچر مناسب را صریح کنید",
          });
        }
      });
    }
    return out;
  },
};

/**
 * Phase 2 boundaries (WEAKNESSES R3/C4/H18):
 *  1. `AsyncLocalStorage.enterWith` is banned — tenant context must be opened
 *     with `als.run(...)` at the request boundary, never mutated in place.
 *  2. tenant controllers may not import platform catalog writes or destructive
 *     helpers (the catalog is platform data, ADR-0031).
 *  3. destructive test helpers may not sit on the public `@scalpai/db` surface;
 *     they belong to the `@scalpai/db/testing` entrypoint (ADR-0028 §H18).
 */
export const platformBoundaries: Rule = {
  name: "platform-boundaries",
  source: "§1/§9.1 (R3/C4/H18)",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];

    for (const scope of ["apps", "packages"]) {
      for (const f of listFiles(ctx.root, scope, [".ts", ".tsx"])) {
        const lines = readRoot(ctx.root, f).split("\n");
        lines.forEach((line, i) => {
          if (/\.enterWith\s*\(/.test(line)) {
            out.push({
              rule: this.name,
              file: `${f}:${i + 1}`,
              message: "استفاده از AsyncLocalStorage.enterWith (نشت context بین درخواست‌ها)",
              fix: "مرز درخواست را با als.run(store, next) بساز (R3)",
            });
          }
        });
      }
    }

    const catalogWrites = /\b(upsertPlan|deletePlan|upsertPlanAsPlatform|deletePlanAsPlatform|resetAll)\b/;
    for (const f of listFiles(ctx.root, "apps/api/src", [".ts"])) {
      const src = readRoot(ctx.root, f);
      if (catalogWrites.test(src)) {
        out.push({
          rule: this.name,
          file: f,
          message: "نوشتن کاتالوگ پلتفرم یا helper مخرب از سطح API تنانت قابل دسترسی است",
          fix: "کاتالوگ فقط از CLI پلتفرم/migration نوشته شود (ADR-0031)",
        });
      }
    }

    if (existsRoot(ctx.root, DB_INDEX)) {
      const index = readRoot(ctx.root, DB_INDEX);
      if (/export\s*\{[^}]*\bresetAll\b/.test(index) || /from\s+["']\.\/testing\.js["']/.test(index)) {
        out.push({
          rule: this.name,
          file: DB_INDEX,
          message: "helper مخرب (resetAll) روی API عمومی پکیج db است",
          fix: "از entrypoint تستی @scalpai/db/testing استفاده کن (H18)",
        });
      }
    }

    return out;
  },
};

/**
 * Encoding guard — root cause of W01..W04: files written through a tool that
 * double-encoded UTF-8 into CP1252 leave tell-tale Latin-1 artifact pairs
 * (Ã/Â/Ø/Ù/â followed by another non-ASCII char) or U+FFFD replacement chars.
 * Legit Persian text lives above U+0500 and never matches.
 */
export const encodingGuard: Rule = {
  name: "encoding-guard",
  source: "§14.3/ADR-21",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const exts = [".ts", ".tsx", ".sql", ".md", ".yml", ".yaml", ".json"];
    const scopes = ["apps", "packages", "docs", "tools", "e2e", "ops"];
    const rootFiles = ["vitest.config.ts", "playwright.config.ts"];
    const files = [
      ...scopes.flatMap((s) => listFiles(ctx.root, s, exts)),
      ...rootFiles.filter((f) => existsRoot(ctx.root, f)),
    ];
    for (const f of files) {
      const src = readRoot(ctx.root, f);
      // one violation per file keeps reports readable
      if (/[\u00C2\u00C3\u00D8\u00D9\u00E2]\P{ASCII}/u.test(src) || src.includes("\uFFFD")) {
        out.push({
          rule: this.name,
          file: f,
          message: "نشانه انکودینگ خراب (mojibake/U+FFFD) در فایل",
          fix: "فایل را UTF-8 تمیز بازنویسی کنید و ابزار نوشتن فایل را اصلاح کنید",
        });
      }
    }
    return out;
  },
};

function existsRoot(root: string, rel: string): boolean {
  try {
    statSync(join(root, rel));
    return true;
  } catch {
    return false;
  }
}
