import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

// engineering-rules §6 / DESIGN §14.2 — initial web payload must stay lean (<300KB gzip; 3D engine lazy only).
const LIMIT_BYTES = Number(process.env.BUNDLE_BUDGET_BYTES ?? 300 * 1024);

const dir = join(process.cwd(), "apps", "web", "dist", "assets");
let total = 0;
for (const f of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(f)) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  // Exclude lazy chunks (e.g. 3D engine) from the initial bundle budget
  if (!f.startsWith("index-")) {
    console.log(`${f.padEnd(34)} ${String(gz).padStart(8)} B gz (lazy chunk - deferred)`);
    continue;
  }
  total += gz;
  console.log(`${f.padEnd(34)} ${String(gz).padStart(8)} B gz [initial payload]`);
}
console.log(`${"—".repeat(44)}\nTOTAL ${total} B gz / limit ${LIMIT_BYTES} B`);
if (total > LIMIT_BYTES) {
  console.error(`BUNDLE BUDGET EXCEEDED by ${total - LIMIT_BYTES} B`);
  process.exit(1);
}
console.log("bundle budget: OK");
