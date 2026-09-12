import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface StrippingFinding {
  kind: "manifest" | "artifact";
  file: string;
  pattern: string;
  context: string;
}

export interface StrippingReport {
  schemaVersion: 1;
  manifest: string;
  dist: string;
  filesScanned: number;
  findings: StrippingFinding[];
  ok: boolean;
}

const FORBIDDEN = [
  { pattern: "SAMPLE_PATIENTS", regex: /SAMPLE_PATIENTS/ },
  { pattern: "SAMPLE_IMAGES", regex: /SAMPLE_IMAGES/ },
  { pattern: "SAMPLE_DETECTIONS", regex: /SAMPLE_DETECTIONS/ },
  { pattern: "dashboard-samples", regex: /dashboard-samples/ },
  { pattern: "sample/fixture asset", regex: /(?:^|[\\/_-])(sample|fixture)(?:[\\/._-]|$)/i },
] as const;
const FIXTURE_ASSET_PATH = /(?:^|[\\/])trichoscopy[\\/](?:vertex|frontal|temporal|occiput|tricho_)/i;

function contextAt(text: string, index: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(root);
  return files.sort();
}

function findForbidden(text: string, file: string, kind: StrippingFinding["kind"]): StrippingFinding[] {
  const findings: StrippingFinding[] = [];
  for (const item of FORBIDDEN) {
    const match = item.regex.exec(text);
    if (match && match.index !== undefined) {
      findings.push({ kind, file, pattern: item.pattern, context: contextAt(text, match.index) });
    }
  }
  return findings;
}

export function scanProductionArtifact(manifestPath: string, distPath: string): StrippingReport {
  const manifest = resolve(manifestPath);
  const dist = resolve(distPath);
  if (!existsSync(manifest)) throw new Error(`manifest does not exist: ${manifest}`);
  if (!existsSync(dist) || !statSync(dist).isDirectory()) throw new Error(`dist directory does not exist: ${dist}`);

  const manifestText = readFileSync(manifest, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(`manifest is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("manifest must contain a JSON object");
  }

  const findings = findForbidden(manifestText, relative(dist, manifest), "manifest");
  const files = walkFiles(dist).filter((file) => file !== manifest);
  for (const file of files) {
    const data = readFileSync(file);
    // Binary assets are checked by their path, while text artifacts are checked by content.
    if (FIXTURE_ASSET_PATH.test(relative(dist, file))) {
      findings.push({ kind: "artifact", file: relative(dist, file), pattern: "trichoscopy fixture asset", context: relative(dist, file) });
    }
    findings.push(...findForbidden(relative(dist, file), relative(dist, file), "artifact"));
    if (data.includes(0)) continue;
    findings.push(...findForbidden(data.toString("utf8"), relative(dist, file), "artifact"));
  }

  return {
    schemaVersion: 1,
    manifest: relative(process.cwd(), manifest),
    dist: relative(process.cwd(), dist),
    filesScanned: files.length,
    findings,
    ok: findings.length === 0,
  };
}

function parseArgs(argv: readonly string[]): { manifest: string; dist: string; report: string } {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    const value = index >= 0 ? argv[index + 1] : undefined;
    if (!value) throw new Error(`missing required argument ${name}`);
    return value;
  };
  const reportIndex = argv.indexOf("--report");
  return {
    manifest: value("--manifest"),
    dist: value("--dist"),
    report: reportIndex >= 0 && argv[reportIndex + 1] ? argv[reportIndex + 1]! : join(value("--dist"), "production-stripping.report.json"),
  };
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = scanProductionArtifact(args.manifest, args.dist);
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Production stripping scan: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`Scanned ${report.filesScanned} artifact files; report=${args.report}`);
    for (const finding of report.findings) {
      console.error(`${finding.kind}: ${finding.file}: ${finding.pattern}`);
      console.error(`  ${finding.context}`);
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(`Production stripping scan: ERROR ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

const invoked = (process.argv[1] ?? "").replaceAll("\\", "/");
if (invoked.endsWith("tools/production-stripping.ts")) main();
