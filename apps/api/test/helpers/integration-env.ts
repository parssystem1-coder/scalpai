import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "@scalpai/db";

/**
 * Integrations must never talk to the main dev database (`.env` points
 * DATABASE_URL at it). `loadEnv` never overrides pre-set vars, so an
 * integration spec that pins only MIGRATE_DATABASE_URL silently leaves
 * DATABASE_URL pointing at the main DB — on 2026-09-24 that wrote test
 * rows into the live dev database. This helper makes isolation structural:
 *
 *  1. Both URLs must exist by the time the spec calls this (importing
 *     @scalpai/db runs loadEnv() as an import side effect, so "before
 *     loadEnv" is not enforceable here) — and they must name the SAME
 *     database.
 *  2. The decisive guard: either URL must not resolve to the same
 *     host:port/db the repo `.env` declares as the main database. A shell
 *     that pins only MIGRATE_DATABASE_URL leaves DATABASE_URL == the .env
 *     main DB, which this check refuses. CI legitimately reuses the NAME
 *     `scalpai` on its service port 5433, so the NAME alone is not the
 *     identifier — the host:port/db triple is.
 *
 * Returns the pinned migrate URL for the spec's migrate/reset/seed calls.
 */
function envTarget(url: string): string {
  const u = new URL(url);
  return `${u.hostname}:${u.port || "5432"}${u.pathname.replace(/\/$/, "")}`;
}

function readMainEnvTargets(root = process.cwd()): { database?: string; migrate?: string } {
  let dir = root;
  for (;;) {
    const p = join(dir, ".env");
    if (existsSync(p)) {
      const out: { database?: string; migrate?: string } = {};
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (!m) continue;
        if (m[1] === "DATABASE_URL") out.database = m[2];
        if (m[1] === "MIGRATE_DATABASE_URL") out.migrate = m[2];
      }
      return out;
    }
    const parent = dirname(dir);
    if (parent === dir) return {};
    dir = parent;
  }
}

export function lockIsolatedTestDb(): string {
  const pre = { migrate: process.env.MIGRATE_DATABASE_URL, app: process.env.DATABASE_URL };

  if (!pre.migrate || !pre.app) {
    throw new Error(
      "integration tests need BOTH MIGRATE_DATABASE_URL and DATABASE_URL set in the " +
        "environment (same isolated database) BEFORE any @scalpai/db import loads .env — " +
        `got MIGRATE_DATABASE_URL=${pre.migrate ? "<set>" : "<missing>"}, ` +
        `DATABASE_URL=${pre.app ? "<set>" : "<missing>"}. ` +
        "See apps/api/test/helpers/integration-env.ts.",
    );
  }

  const dbName = (url: string): string => {
    try {
      return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    } catch {
      throw new Error(`integration test DB URL is not parseable: ${url}`);
    }
  };
  if (dbName(pre.migrate) !== dbName(pre.app)) {
    throw new Error(
      `MIGRATE_DATABASE_URL (${dbName(pre.migrate)}) and DATABASE_URL (${dbName(pre.app)}) ` +
        "must name the SAME isolated database",
    );
  }

  const mainEnv = readMainEnvTargets();
  const forbidden = new Set(
    [mainEnv.database, mainEnv.migrate].filter((v): v is string => Boolean(v)).map(envTarget),
  );
  for (const [label, url] of [
    ["MIGRATE_DATABASE_URL", pre.migrate],
    ["DATABASE_URL", pre.app],
  ] as const) {
    if (forbidden.has(envTarget(url))) {
      throw new Error(
        `${label} resolves to the main dev database from .env (${envTarget(url)}) — ` +
          "pin both URLs to an isolated test database instead",
      );
    }
  }

  // loadEnv() fills remaining secrets (JWT, PHI ring, ...) from .env
  // without ever overriding the two DB URLs pinned above.
  loadEnv();
  process.env.MIGRATE_DATABASE_URL = pre.migrate;
  process.env.DATABASE_URL = pre.app;
  return pre.migrate;
}
