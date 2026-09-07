import { randomUUID, createHash } from "node:crypto";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema.js";

export type Tx = NodePgDatabase<typeof schema> & { client: PoolClient };

declare global {
  var _postgresPool: Pool | undefined;
}

/**
 * Pool ceilings (WEAKNESSES phase 9, ADR-0042).
 *
 * What was wrong: `max: 10, connectionTimeoutMillis: 15000` and nothing else. A
 * single pathological query - a seq scan behind a missing index, a lock wait, a
 * client that opened a transaction and went away - held its connection for as
 * long as it liked. Ten of those and the API is down while every process looks
 * healthy. Postgres has the right primitives, they were simply never set:
 *
 *   statement_timeout                     - kill the query, not the box
 *   idle_in_transaction_session_timeout   - a transaction nobody is driving is a
 *                                           lock held for nothing
 *   query_timeout (client side)            - covers a stalled socket, which the
 *                                           server-side timeout cannot see
 *   idleTimeoutMillis                      - return idle connections
 *
 * Every value is an env override so an operator can widen it for a maintenance
 * task without editing code, and `0` means "no limit" exactly like in Postgres.
 */
export interface ResolvedPoolConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statement_timeout: number;
  query_timeout: number;
  idle_in_transaction_session_timeout: number;
  application_name: string;
}

export const POOL_DEFAULTS = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  statementTimeoutMs: 30_000,
  idleInTransactionTimeoutMs: 15_000,
} as const;

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number, min = 0): number {
  const raw = env[name];
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) return fallback;
  return value;
}

export function resolvePoolConfig(env: NodeJS.ProcessEnv = process.env): ResolvedPoolConfig {
  const statementTimeout = envInt(env, "DB_STATEMENT_TIMEOUT_MS", POOL_DEFAULTS.statementTimeoutMs);
  return {
    // A pool bigger than the server's max_connections is a self-inflicted outage.
    max: Math.max(1, envInt(env, "DB_POOL_MAX", POOL_DEFAULTS.max, 1)),
    idleTimeoutMillis: envInt(env, "DB_POOL_IDLE_TIMEOUT_MS", POOL_DEFAULTS.idleTimeoutMillis),
    connectionTimeoutMillis: envInt(env, "DB_CONNECT_TIMEOUT_MS", POOL_DEFAULTS.connectionTimeoutMillis),
    statement_timeout: statementTimeout,
    // The client-side timeout has to be at least as generous as the server-side
    // one, otherwise the driver aborts a query Postgres is still allowed to run.
    query_timeout: envInt(env, "DB_QUERY_TIMEOUT_MS", statementTimeout === 0 ? 0 : statementTimeout + 5_000),
    idle_in_transaction_session_timeout: envInt(
      env,
      "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS",
      POOL_DEFAULTS.idleInTransactionTimeoutMs,
    ),
    // Shows up in pg_stat_activity, which is where an incident actually starts.
    application_name: env.DB_APPLICATION_NAME?.trim() || "scalpai-api",
  };
}

export function createPool(): Pool {
  if (!global._postgresPool) {
    const limits = resolvePoolConfig();
    if (process.env.SQL_HOST) {
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined,
        ...limits,
      });
    } else if (process.env.DATABASE_URL) {
      global._postgresPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ...limits,
      });
    } else {
      global._postgresPool = new Pool({ ...limits });
    }

    global._postgresPool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err.message);
    });
  }
  return global._postgresPool;
}

export class DbService {
  private pool: Pool = createPool();

  async withTenant<T>(clinicId: string, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET ROLE scalpai_app");
      await client.query("SELECT set_config('app.clinic_id', $1, true)", [clinicId]);
      if (userId) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      }
      const d = drizzle(client, { schema });
      const tx = Object.assign(d, { client }) as Tx;
      const res = await fn(tx);
      await client.query("RESET ROLE");
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async withClient<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const d = drizzle(client, { schema });
      const tx = Object.assign(d, { client }) as Tx;
      const res = await fn(tx);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Liveness/readiness probe: the cheapest possible round trip (phase 9, L3). */
  async ping(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** sha256 helper shared by auth + audit */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newId(): string {
  return randomUUID();
}
