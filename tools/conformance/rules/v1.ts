import { join } from "node:path";
import type { Rule, RuleContext, Violation } from "../lib/types.js";
import { listFiles, readRoot } from "../lib/walk.js";

const EXEMPT_TABLES = new Set(["__migrations", "plans", "plan_features", "refresh_tokens", "clinics"]);
const RLS_TABLES = [
  "branches",
  "users",
  "patients",
  "services",
  "sessions",
  "gallery_items",
  "analyses",
  "consents",
  "entitlements",
  "usage_counters",
  "audit_log",
];

/** engineering-rules §1 + §4: business tables need clinic_id + RLS ENABLE/FORCE (ADR-0003). */
export const tenantSafety: Rule = {
  name: "tenant-safety",
  source: "§1/§4",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const files = listFiles(ctx.root, join("packages", "db", "sql"), [".sql"]);
    for (const f of files) {
      const sqlText = readRoot(ctx.root, f);
      for (const m of sqlText.matchAll(/CREATE TABLE IF NOT EXISTS "?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
        const table = m[1]!;
        if (EXEMPT_TABLES.has(table)) continue;
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
        const body = sqlText.slice(open, close);
        if (!/\bclinic_id\b/.test(body)) {
          out.push({
            rule: this.name,
            file: `${f}:${table}`,
            message: `جدول business '${table}' ستون clinic_id ندارد`,
            fix: "clinic_id uuid NOT NULL REFERENCES clinics(id) اضافه کنید یا با ADR مستثنا کنید",
          });
        }
      }
    }
    // global RLS posture for every known business table
    const allSql = files.map((f) => readRoot(ctx.root, f)).join("\n");
    for (const t of RLS_TABLES) {
      if (!allSql.includes(t)) continue; // not defined yet
      const enableRe = new RegExp(`ALTER\\s+TABLE\\s+${t}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      const forceRe = new RegExp(`ALTER\\s+TABLE\\s+${t}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      if (!enableRe.test(allSql)) {
        out.push({ rule: this.name, file: `sql:${t}`, message: `RLS روی '${t}' فعال نیست`, fix: "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" });
      }
      if (!forceRe.test(allSql)) {
        out.push({ rule: this.name, file: `sql:${t}`, message: `FORCE RLS روی '${t}' نیست`, fix: "ALTER TABLE ... FORCE ROW LEVEL SECURITY" });
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

/** engineering-rules §2: PHI must never reach logs. */
export const phiLogs: Rule = {
  name: "phi-logs",
  source: "§2",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const scope of ["apps", "packages"]) {
      for (const f of listFiles(ctx.root, scope, [".ts"])) {
        if (f.endsWith(".spec.ts")) continue;
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

/** engineering-rules §5: no hardcoded credentials in source. */
export const secrets: Rule = {
  name: "secrets",
  source: "§5",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const rel of [...listFiles(ctx.root, "apps", [".ts"]), ...listFiles(ctx.root, "packages", [".ts"])]) {
      if (rel.endsWith(".spec.ts")) continue;
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

/** engineering-rules §9.1: mutating endpoints must declare @RequireFeature/@Roles/@Public. */
export const featureGate: Rule = {
  name: "feature-gate",
  source: "§9.1",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const f of listFiles(ctx.root, "apps/api/src", [".controller.ts"])) {
      const isAuthPublic = f.includes("auth/");
      const src = readRoot(ctx.root, f).split("\n");
      src.forEach((line, i) => {
        if (!/^@\s*(Post|Put|Patch|Delete)\b/.test(line.trim())) return; // reads are role-matrix territory
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
