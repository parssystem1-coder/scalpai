import { describe, expect, it } from "vitest";
import { POOL_DEFAULTS, resolvePoolConfig } from "./tenant.js";

/**
 * Phase 9 regression (ADR-0042). The pool used to have exactly two knobs and no
 * timeout of any kind: one stuck statement could hold a connection until the
 * process was restarted. These assertions are the contract that keeps every
 * connection bounded.
 */
describe("phase 9 - the connection pool is bounded by default", () => {
  it("sets a statement timeout, an idle-in-transaction timeout and a ceiling", () => {
    const cfg = resolvePoolConfig({});
    expect(cfg.max).toBe(POOL_DEFAULTS.max);
    expect(cfg.statement_timeout).toBe(POOL_DEFAULTS.statementTimeoutMs);
    expect(cfg.idle_in_transaction_session_timeout).toBe(POOL_DEFAULTS.idleInTransactionTimeoutMs);
    expect(cfg.idleTimeoutMillis).toBe(POOL_DEFAULTS.idleTimeoutMillis);
    expect(cfg.connectionTimeoutMillis).toBe(POOL_DEFAULTS.connectionTimeoutMillis);
  });

  it("never lets the client abort a query the server is still allowed to run", () => {
    const cfg = resolvePoolConfig({ DB_STATEMENT_TIMEOUT_MS: "9000" });
    expect(cfg.statement_timeout).toBe(9_000);
    expect(cfg.query_timeout).toBeGreaterThan(cfg.statement_timeout);
  });

  it("honours explicit overrides, including 0 meaning unlimited", () => {
    const cfg = resolvePoolConfig({
      DB_POOL_MAX: "25",
      DB_STATEMENT_TIMEOUT_MS: "0",
      DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "0",
      DB_APPLICATION_NAME: "scalpai-migrate",
    });
    expect(cfg.max).toBe(25);
    expect(cfg.statement_timeout).toBe(0);
    expect(cfg.query_timeout).toBe(0);
    expect(cfg.idle_in_transaction_session_timeout).toBe(0);
    expect(cfg.application_name).toBe("scalpai-migrate");
  });

  it("falls back to the safe default for junk and refuses a pool of zero", () => {
    expect(resolvePoolConfig({ DB_POOL_MAX: "0" }).max).toBe(POOL_DEFAULTS.max);
    expect(resolvePoolConfig({ DB_POOL_MAX: "-4" }).max).toBe(POOL_DEFAULTS.max);
    expect(resolvePoolConfig({ DB_STATEMENT_TIMEOUT_MS: "soon" }).statement_timeout).toBe(
      POOL_DEFAULTS.statementTimeoutMs,
    );
    expect(resolvePoolConfig({ DB_APPLICATION_NAME: "   " }).application_name).toBe("scalpai-api");
  });
});
