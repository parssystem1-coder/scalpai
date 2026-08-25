import { join } from "node:path";
import type { Rule, RuleContext, Violation } from "../lib/types.js";
import { listFiles, readRoot } from "../lib/walk.js";

const EXEMPT_TABLES = new Set(["__migrations", "plans", "plan_features", "refresh_tokens", "clinics"]);

/** engineering-rules Â§1 + Â§4: business tables need clinic_id + RLS ENABLE/FORCE (ADR-0003). */
export const tenantSafety: Rule = {
  name: "tenant-safety",
  source: "Â§1/Â§4",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const dir = join(ctx.root, "packages", "db", "sql");
    let files: string[] = [];
    try {
      files = listFiles(ctx.root, join("packages", "db", "sql"), [".sql"]);
    } catch {
      files = [];
    }
    void dir;
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
            if (depth === 0) { close = i; break; }
          }
        }
        const body = sqlText.slice(open, close);
        if (!/\bclinic_id\b/.test(body)) {
          out.push({
            rule: this.name,
            file: `${f}:${table}`,
            message: `Ø¬Ø¯ÙˆÙ„ business '${table}' Ø³ØªÙˆÙ† clinic_id Ù†Ø¯Ø§Ø±Ø¯`,
            fix: "clinic_id uuid NOT NULL REFERENCES clinics(id) Ø§Ø¶Ø§ÙÙ‡ Ú©Ù†ÛŒØ¯ ÛŒØ§ Ø¬Ø¯ÙˆÙ„ Ø±Ø§ Ø¯Ø± EXEMPT_TABLES Ù…Ø³ØªØ«Ù†Ø§ Ú©Ù†ÛŒØ¯ (Ø¨Ø§ ADR)",
          });
        }
        const esc = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`ENABLE ROW LEVEL SECURITY`, "i").test(sqlText) || !sqlText.includes(table)) {
          // presence of RLS statements is checked globally below
        }
      }
    }
    // global RLS posture
    const allSql = files.map((f) => readRoot(ctx.root, f)).join("\n");
    for (const t of ["branches","users","patients","services","sessions","gallery_items","analyses","consents","entitlements","usage_counters","audit_log"]) {
      if (!allSql.includes(t)) continue; // not defined yet
      if (!new RegExp(`ALTER\\s+TABLE\\s+`+t+`\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(allSql)) {
        out.push({ rule: this.name, file: `sql:${t}`, message: `RLS Ø±ÙˆÛŒ '${t}' ÙØ¹Ø§Ù„ Ù†ÛŒØ³Øª`, fix: "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" });
      }
      if (!new RegExp(`ALTER\\s+TABLE\\s+`+t+`\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(allSql)) {
        out.push({ rule: this.name, file: `sql:${t}`, message: `FORCE RLS Ø±ÙˆÛŒ '${t}' Ù†ÛŒØ³Øª`, fix: "ALTER TABLE ... FORCE ROW LEVEL SECURITY" });
      }
    }
    return out;
  },
};

/** engineering-rules Â§1: only packages/db may touch pg/drizzle directly. */
export const dbAccess: Rule = {
  name: "db-access",
  source: "Â§1",
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
            message: `import Ù…Ø³ØªÙ‚ÛŒÙ… '${m[1]}' Ø®Ø§Ø±Ø¬ Ø§Ø² packages/db`,
            fix: "Ø¯Ø³ØªØ±Ø³ÛŒ Ø¯Ø§Ø¯Ù‡ ÙÙ‚Ø· Ø§Ø² Ø·Ø±ÛŒÙ‚ repos/packages/db (rules Â§1)",
          });
        }
      }
    }
    return out;
  },
};

/** engineering-rules Â§2: PHI must never reach logs. */
export const phiLogs: Rule = {
  name: "phi-logs",
  source: "Â§2",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const scope of ["apps", "packages"]) {
      for (const f of listFiles(ctx.root, scope, [".ts"])) {
        if (f.endsWith(".spec.ts")) continue;
        const lines = readRoot(ctx.root, f).split("\n");
        lines.forEach((line, i) => {
          if (/(console\.(log|error|warn)|logger\.\w+)\s*\(/.test(line) && /(phone|password|refreshToken|nationalId|notes)/i.test(line)) {
            out.push({ rule: this.name, file: `${f}:${i + 1}`, message: "Ø§Ø­ØªÙ…Ø§Ù„ Ù†Ø´Øª PHI Ø¨Ù‡ Ù„Ø§Ú¯", fix: "ÙÙ‚Ø· Ø´Ù†Ø§Ø³Ù‡â€ŒÙ‡Ø§ Ù„Ø§Ú¯ Ø´ÙˆÙ†Ø¯Ø› Ù…Ù‚Ø¯Ø§Ø± Ø­Ø³Ø§Ø³ Ø­Ø°Ù Ø´ÙˆØ¯" });
          }
        });
      }
    }
    return out;
  },
};

/** engineering-rules Â§5: no hardcoded credentials in source. */
export const secrets: Rule = {
  name: "secrets",
  source: "Â§5",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const rel of [...listFiles(ctx.root, "apps", [".ts", ".yml", ".yaml"]), ...listFiles(ctx.root, "packages", [".ts"]), ...listFiles(ctx.root, ".", [".env"])] as string[]) {
      if (rel.endsWith(".example")) continue;
      const lines = readRoot(ctx.root, rel).split("\n");
      lines.forEach((line, i) => {
        if (/dev_only/i.test(line)) return;
        if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
          out.push({ rule: this.name, file: `${rel}:${i + 1}`, message: "Ú©Ù„ÛŒØ¯ Ø®ØµÙˆØµÛŒ Ø¯Ø± Ø³ÙˆØ±Ø³", fix: "secret ÙÙ‚Ø· env" });
        }
        if (/\bAKIA[0-9A-Z]{16}\b/.test(line)) {
          out.push({ rule: this.name, file: `${rel}:${i + 1}`, message: "AWS key Ø¯Ø± Ø³ÙˆØ±Ø³", fix: "secret ÙÙ‚Ø· env" });
        }
        if (/\bghp_[A-Za-z0-9]{36}\b/.test(line)) {
          out.push({ rule: this.name, file: `${rel}:${i + 1}`, message: "GitHub token Ø¯Ø± Ø³ÙˆØ±Ø³", fix: "secret ÙÙ‚Ø· env" });
        }
      });
    }
    return out;
  },
};

/** engineering-rules Â§3: one error shape, registered globally. */
export const errorContract: Rule = {
  name: "error-contract",
  source: "Â§3",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    const filterRel = "apps/api/src/common/error.filter.ts";
    const modRel = "apps/api/src/app.module.ts";
    let okFilter = false;
    let okModule = false;
    try {
      okFilter = /class AllExceptionsFilter/.test(readRoot(ctx.root, filterRel));
      okModule = /APP_FILTER/.test(readRoot(ctx.root, modRel));
    } catch {
      /* files optional at phase 0 */
    }
    if (!okFilter || !okModule) {
      out.push({
        rule: this.name,
        file: okFilter ? modRel : filterRel,
        message: "Ø´Ú©Ù„ Ø«Ø§Ø¨Øª Ø®Ø·Ø§ ÛŒØ§ Ø«Ø¨Øª Ø³Ø±Ø§Ø³Ø±ÛŒ ÙÛŒÙ„ØªØ± ÛŒØ§ÙØª Ù†Ø´Ø¯",
        fix: "AllExceptionsFilter + APP_FILTER Ø¯Ø± AppModule (Ù‚ÙˆØ§Ø¹Ø¯ Â§3)",
      });
    }
    return out;
  },
};

/** engineering-rules Â§9.1: gated endpoints must declare @RequireFeature/@Roles/@Public. */
export const featureGate: Rule = {
  name: "feature-gate",
  source: "Â§9.1",
  check(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (const f of listFiles(ctx.root, "apps/api/src", [".controller.ts"])) {
      const isAuthPublic = f.includes("auth/");
      const src = readRoot(ctx.root, f).split("\n");
      src.forEach((line, i) => {
        if (!/^@\s*(Post|Put|Patch|Delete)\b/.test(line.trim())) return; // reads are role-matrix territory, not plan-gated
        const window = [...src.slice(Math.max(0, i - 6), i), ...src.slice(i + 1, i + 7)].join("\n");
        if (!/@RequireFeature\(|@Roles\(|@Public\(/.test(window) && !isAuthPublic) {
          out.push({
            rule: this.name,
            file: `${f}:${i + 1}`,
            message: "endpoint Ø¨Ø¯ÙˆÙ† @RequireFeature/@Roles/@Public",
            fix: "Ù†Ù‚Ø´ ÛŒØ§ ÙÛŒÚ†Ø± Ù…Ù†Ø§Ø³Ø¨ Ø±Ø§ ØµØ±ÛŒØ­ Ú©Ù†ÛŒØ¯",
          });
        }
      });
    }
    return out;
  },
};
