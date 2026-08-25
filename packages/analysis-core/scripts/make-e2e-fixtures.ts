import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import sharp from "sharp";

// Repo-root independent: always writes next to the e2e suite.
const OUT_DIR = fileURLToPath(new URL("../../../e2e/fixtures/", import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });
const w = 480;
const h = 360;
const raw = Buffer.alloc(w * h * 3);
let s = 11;
const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) / 0xffffffff);
for (let i = 0; i < w * h; i++) {
  const v = Math.floor(rand() * 255);
  raw[i * 3] = v;
  raw[i * 3 + 1] = v;
  raw[i * 3 + 2] = v;
}
await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toFile(`${OUT_DIR}healthy.jpg`);
await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).blur(9).jpeg().toFile(`${OUT_DIR}blurry.jpg`);
console.log("fixtures done");
