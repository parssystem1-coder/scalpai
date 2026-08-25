import { loadEnv } from "./load-env.js";
loadEnv();
import { migrate } from "./migrate.js";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL is required");
  process.exit(1);
}

migrate(url)
  .then((r) => {
    console.log(`migrate: applied=${r.applied.length} skipped=${r.skipped.length}`);
    for (const f of r.applied) console.log(`  + ${f}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("migrate failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
