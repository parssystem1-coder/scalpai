/**
 * FIXTURE - a repository that opens its OWN connection and queries on a free
 * handle, so nothing ever sets the clinic key for these rows and RLS has no
 * value to filter on (ADR-0003).
 *
 * Seeds three findings: a connection opened without the clinic context, a
 * repository owning a connection at all, and a query that never sees the
 * tenant-scoped transaction handle.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { patients } from "../schema.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function listEveryPatient(): Promise<unknown[]> {
  const handle = drizzle(pool);
  return handle.select().from(patients);
}
