import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

// engineering-rules §6 / DESIGN §14.2 — initial web payload must stay lean.
const LIMIT_BYTES = Number(process.env.BUNDLE_BUDGET_BYTES ?? 300 * 1024);

const dir = join(process.cwd(), "apps", "web", "dist", "assets");
let total = 0;
for (const f of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(f)) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  console.log(`${f.padEnd(34)} ${String(gz).padStart(8)} B gz`);
}
console.log(`${"—".repeat(44)}\nTOTAL ${total} B gz / limit ${LIMIT_BYTES} B`);
if (total > LIMIT_BYTES) {
  console.error(`BUNDLE BUDGET EXCEEDED by ${total - LIMIT_BYTES} B`);
  process.exit(1);
}
console.log("bundle budget: OK");
