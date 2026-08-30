import { loadEnv } from "./load-env.js";
loadEnv();
import { migrate } from "./migrate.js";
import type { PoolConfig } from "pg";

let config: string | PoolConfig;

if (process.env.SQL_HOST) {
  config = {
    host: process.env.SQL_HOST,
    user: process.env.SQL_ADMIN_USER,
    password: process.env.SQL_ADMIN_PASSWORD,
    database: process.env.SQL_DB_NAME,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined,
  };
} else {
  const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("MIGRATE_DATABASE_URL or DATABASE_URL is required");
    process.exit(1);
  }
  config = url;
}

migrate(config)
  .then((r) => {
    console.log(`migrate: applied=${r.applied.length} skipped=${r.skipped.length}`);
    for (const f of r.applied) console.log(`  + ${f}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("migrate failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
