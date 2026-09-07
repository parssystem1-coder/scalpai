import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DRILL_GATES, REQUIRED_GATES } from "../ci/gate-report.js";

/**
 * Phase 9 regression suite - "backup, restore and dependable operations".
 *
 * The audit verdict for C10 was blunt: `pg_dump` alone, AES-256-CBC without
 * integrity, a passphrase on the command line WITH a shared fallback, nothing
 * off-site and no restore ever attempted. All of that lived in shell and YAML,
 * which is exactly why it rotted unnoticed - so it gets tests like code does.
 *
 * CI additionally EXECUTES this pipeline (job `backup-restore`): back up both
 * stores, prove the off-site copy cannot be deleted, restore into a scratch
 * database and smoke-query it. These assertions are the contract; the workflow
 * is the proof.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Drops whole-line `#` comments: a comment documenting a banned pattern is not the pattern. */
function code(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

const backup = read("ops/backup.sh");
const restore = read("ops/restore.sh");
const drill = read("ops/restore-drill.sh");
const backupImage = read("ops/backup.Dockerfile");
const prod = read("ops/prod.yml");
const envTemplate = read("ops/prod.env.template");
const envExample = read(".env.example");
const ci = read(".github/workflows/ci.yml");
const nightly = read(".github/workflows/nightly.yml");
const monthly = read(".github/workflows/restore-drill.yml");
const runbook = read("docs/ops/RUNBOOK.md");
const opsReadme = read("ops/README.md");
const rootPkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

describe("C10 - the backup covers PostgreSQL AND the object store", () => {
  it("dumps the database and mirrors the media bucket", () => {
    expect(backup).toContain("pg_dump");
    expect(backup).toContain("mc mirror");
    expect(backup).toContain("objects.tar.gz.age");
  });

  it("records what it captured, with a checksum per artifact", () => {
    expect(backup).toContain("manifest.json");
    expect(backup).toContain("plaintextSha256");
    expect(backup).toContain("objectCount");
  });

  it("restores both stores and refuses a snapshot whose checksum does not match", () => {
    expect(restore).toContain("pg_restore");
    expect(restore).toContain("checksum mismatch");
    expect(restore).toContain("mc mirror");
  });
});

describe("C10 - encryption is authenticated, and the key is not on the host", () => {
  it("uses age instead of an unauthenticated CBC pipe", () => {
    expect(code(backup)).toContain("age -R");
    expect(code(backup)).not.toContain("aes-256-cbc");
    expect(code(restore)).toContain("age -d -i");
    expect(code(restore)).not.toContain("aes-256-cbc");
  });

  it("never passes a secret on the command line", () => {
    for (const script of [backup, restore, drill]) {
      expect(code(script)).not.toContain("-pass \"pass:");
      expect(code(script)).not.toContain("pass:${");
    }
  });

  it("keeps only the PUBLIC recipients on the machine that writes backups", () => {
    expect(backup).toContain("BACKUP_AGE_RECIPIENTS_FILE");
    expect(code(backup)).not.toContain("BACKUP_AGE_IDENTITY_FILE");
    expect(restore).toContain("BACKUP_AGE_IDENTITY_FILE");
  });

  it("has no fallback passphrase anywhere - a missing secret fails the run", () => {
    for (const text of [backup, restore, drill, prod]) {
      expect(text).not.toContain("scalpai_secure_backup_key");
      expect(text).not.toContain("BACKUP_ENCRYPTION_PASSPHRASE");
    }
    expect(backup).toContain("this script has no defaults");
    expect(backup).toMatch(/is required/);
  });

  it("reads credentials from a mounted file when <NAME>_FILE is set", () => {
    for (const script of [backup, restore, drill]) {
      expect(script).toContain('file_var="$1_FILE"');
    }
  });
});

describe("C10 - the snapshot leaves the host and cannot be deleted", () => {
  it("uploads off-site and puts a WORM retention lock on what it uploaded", () => {
    expect(backup).toContain("mc cp --quiet --recursive");
    expect(backup).toContain("mc retention set --recursive");
    expect(backup).toContain("BACKUP_OFFSITE_RETENTION_DAYS");
    expect(backup).toContain("BACKUP_OFFSITE_LOCK_MODE");
  });

  it("fails the run when the off-site copy or its lock fails", () => {
    expect(backup).toContain("off-site upload failed");
    expect(backup).toContain("off-site retention lock failed");
  });

  it("documents both retention windows", () => {
    expect(backup).toContain("BACKUP_RETENTION_DAYS");
    expect(envTemplate).toContain("BACKUP_RETENTION_DAYS");
    expect(envTemplate).toContain("BACKUP_OFFSITE_RETENTION_DAYS");
    expect(runbook).toContain("BACKUP_OFFSITE_RETENTION_DAYS");
  });

  it("proves immutability by attempting a delete, not by asserting it", () => {
    const check = read("tools/ci/offsite-check.sh");
    expect(check).toContain("mc rm --force");
    expect(check).toContain("retention lock is not in force");
  });

  it("never fails silently", () => {
    expect(backup).toContain("trap cleanup EXIT");
    expect(backup).toContain("notify \"backup.failed\"");
    expect(backup).toContain("last-run.json");
  });
});

describe("C10 - a restore drill produces measured, signed evidence", () => {
  it("restores into scratch targets, never over live data", () => {
    expect(drill).toContain("--target-db");
    expect(drill).toContain("--target-bucket");
    expect(drill).toContain("DRILL_DB_PREFIX");
  });

  it("runs real smoke queries after the restore", () => {
    expect(drill).toContain("from clinics");
    expect(drill).toContain("from patients");
    expect(drill).toContain("information_schema.tables");
    expect(drill).toContain("restored database has no patients");
  });

  it("measures recovery time and signs the report", () => {
    expect(drill).toContain("recoveryTimeSeconds");
    expect(drill).toContain("openssl dgst -sha256 -hmac");
    expect(drill).toContain("HMAC-SHA256");
    expect(drill).toContain("DRILL_REPORT_HMAC_KEY");
  });

  it("is reachable through npm, like every other executable surface", () => {
    expect(rootPkg.scripts["ops:backup"]).toContain("ops/backup.sh");
    expect(rootPkg.scripts["ops:restore"]).toContain("ops/restore.sh");
    expect(rootPkg.scripts["ops:restore-drill"]).toContain("ops/restore-drill.sh");
  });
});

describe("C10 - backup and restore are gated, not cron-logged", () => {
  it("requires backup, off-site and restore evidence in CI", () => {
    for (const gate of ["backup-image", "backup-run", "backup-offsite", "restore-drill"]) {
      expect(REQUIRED_GATES).toContain(gate);
      expect(ci).toContain(`run-gate.sh ${gate}`);
    }
  });

  it("defines a drill gate set that a scheduled run must satisfy", () => {
    expect([...DRILL_GATES]).toEqual(["backup-run", "backup-offsite", "restore-drill"]);
    for (const gate of DRILL_GATES) expect(REQUIRED_GATES).toContain(gate);
    expect(rootPkg.scripts["ci:gate:drill"]).toContain("--set=drill");
  });

  it("drills nightly and re-reads its own evidence", () => {
    expect(nightly).toContain("backup-restore-drill");
    expect(nightly).toContain("run-gate.sh restore-drill bash ops/restore-drill.sh");
    expect(nightly).toContain("npm run ci:gate:drill");
  });

  it("drills the real staging snapshot monthly, behind one visible switch", () => {
    expect(monthly).toContain('cron: "0 3 1 * *"');
    expect(monthly).toContain("ENABLE_STAGING_RESTORE_DRILL");
    expect(monthly).toContain("--verify-only");
    expect(monthly).toContain("npm run ci:gate:drill");
  });

  it("builds the backup image in CI with the tooling baked in", () => {
    expect(ci).toContain("run-gate.sh backup-image docker compose");
    const directives = code(backupImage);
    for (const tool of ["age", "jq", "mc"]) expect(directives).toContain(tool);
    expect(directives).toContain("HEALTHCHECK");
    // the scripts are COPIED, so what runs is what was reviewed
    expect(directives).toContain("COPY ops/backup.sh");
  });
});

describe("C10 - compose runs the hardened service, with no runtime package install", () => {
  it("builds backup-cron from its own Dockerfile", () => {
    const block = prod.slice(prod.indexOf("\n  backup-cron:"), prod.indexOf("\nvolumes:"));
    expect(block).toContain("dockerfile: ops/backup.Dockerfile");
    expect(block).not.toContain("apk add");
    expect(block).toContain("BACKUP_AGE_RECIPIENTS_FILE");
    expect(block).toContain("BACKUP_OFFSITE_ENDPOINT");
  });

  it("keeps the backup image on the same Postgres major as the database", () => {
    const major = /pgvector\/pgvector:pg(\d+)/.exec(prod)?.[1];
    expect(major).toBeDefined();
    expect(prod).toContain(`POSTGRES_IMAGE: postgres:${major}-alpine`);
  });

  it("requires every new backup and alerting variable", () => {
    for (const name of [
      "BACKUP_AGE_RECIPIENTS_FILE",
      "BACKUP_OFFSITE_ENDPOINT",
      "BACKUP_OFFSITE_BUCKET",
      "BACKUP_OFFSITE_ACCESS_KEY",
      "BACKUP_OFFSITE_SECRET_KEY",
      "ALERT_WEBHOOK_URL",
    ]) {
      expect(prod, `${name} must be mandatory`).toContain(`\${${name}:?`);
      expect(envTemplate, `${name} must be documented`).toContain(name);
    }
  });
});

describe("L3 - the stack can be observed and can page someone", () => {
  it("boots closed: production without an alert sink does not start", () => {
    const config = read("apps/api/src/common/observability.config.ts");
    expect(config).toContain("ALERT_WEBHOOK_URL is required in production");
    expect(read("apps/api/src/main.ts")).toContain("assertObservabilityConfig()");
  });

  it("exposes liveness, readiness and a token-gated scrape endpoint", () => {
    const controller = read("apps/api/src/ops/ops.controller.ts");
    expect(controller).toContain('@Get("health/live")');
    expect(controller).toContain('@Get("health/ready")');
    expect(controller).toContain('@Get("metrics")');
    // a probe must never be able to burn a clinic's request budget
    expect(controller).toContain('@RateLimit("ops-probe", 0)');
    expect(prod).toContain("/api/v1/health/ready");
  });

  it("scrubs everything it emits", () => {
    expect(read("apps/api/src/common/alerting.ts")).toContain("scrubForLog");
    expect(read("apps/api/src/ops/readiness.ts")).toContain("scrubText");
    expect(read("apps/api/src/common/logging.ts")).toContain("ALLOWED_LOG_KEYS");
  });

  it("correlates a request id through log, metric and alert", () => {
    const logging = read("apps/api/src/common/logging.ts");
    expect(logging).toContain("REQUEST_ID_HEADER");
    expect(logging).toContain("emitRequestFinished");
    expect(read("apps/api/src/ops/observability.ts")).toContain("requestId: finished.requestId");
  });
});

describe("phase 9 - the pool and the limiter are bounded, and documented", () => {
  it("gives every connection a statement and idle-in-transaction timeout", () => {
    const tenant = read("packages/db/src/tenant.ts");
    expect(tenant).toContain("statement_timeout");
    expect(tenant).toContain("idle_in_transaction_session_timeout");
    expect(tenant).toContain("query_timeout");
    expect(prod).toContain("DB_STATEMENT_TIMEOUT_MS");
  });

  it("limits every route, not only the decorated ones (L4)", () => {
    const guard = read("apps/api/src/common/rate-limit.guard.ts");
    expect(guard).toContain("DEFAULT_LIMIT");
    expect(guard).toContain("GLOBAL_LIMIT");
    expect(prod).toContain("RATE_LIMIT_DEFAULT_MAX");
    expect(prod).toContain("RATE_LIMIT_GLOBAL_MAX");
  });

  it("documents every new knob in .env.example", () => {
    for (const name of [
      "ALERT_WEBHOOK_URL",
      "METRICS_TOKEN",
      "DB_STATEMENT_TIMEOUT_MS",
      "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS",
      "RATE_LIMIT_DEFAULT_MAX",
      "RATE_LIMIT_GLOBAL_MAX",
    ]) {
      expect(envExample, `${name} is undocumented`).toContain(name);
    }
  });
});

describe("phase 9 - the runbook exists and the old warning is gone", () => {
  it("covers every incident the phase promised", () => {
    for (const heading of [
      "restore",
      "key rotation",
      "tenant isolation",
      "data deletion",
      "incident",
    ]) {
      expect(runbook.toLowerCase(), `runbook is missing '${heading}'`).toContain(heading);
    }
    expect(existsSync(join(ROOT, "docs/ops/RUNBOOK.md"))).toBe(true);
  });

  it("stops telling operators the backup path is unsafe", () => {
    expect(opsReadme).not.toContain("authenticated نیست");
    expect(opsReadme).toContain("RUNBOOK.md");
    expect(opsReadme).toContain("scalpai-restore-drill");
  });

  it("has an ADR for the decision", () => {
    const adr = read("docs/adr/ADR-0042-backup-restore-and-observability.md");
    expect(adr).toContain("age");
    expect(adr).toContain("WORM");
    expect(adr).toContain("ADR-0042");
  });
});
