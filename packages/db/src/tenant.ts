import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema.js";

export type Tx = NodePgDatabase<typeof schema> & { client: PoolClient };

function makeTx(client: PoolClient): Tx {
  const t = drizzle(client, { schema }) as unknown as Tx;
  t.client = client;
  return t;
}

export class DbService {
  private pool = new Pool({ connectionString: process.env.DATABASE_URL });

  /**
   * The ONLY way application code touches data (engineering-rules §1).
   * Opens a transaction and sets `app.clinic_id` (RLS key) as the very
   * first statement — ADR-0003 layer 3.
   */
  async withTenant<T>(clinicId: string, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.clinic_id', $1, true)", [clinicId]);
      const result = await fn(makeTx(client));
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Tenant-free transaction — ONLY for pre-auth flows (login lookup, refresh rotation). */
  async withClient<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(makeTx(client));
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
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
