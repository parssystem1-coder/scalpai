import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Repository secret scan (WEAKNESSES H14/M7/R13).
 *
 * The conformance harness already refuses committed keys inside source scopes;
 * this sweep covers EVERY tracked file - json, yaml, ops scripts, root files and
 * dotfiles included - and runs as its own CI gate so a leak cannot ride in
 * through a surface no rule happened to walk.
 *
 * Two tiers:
 *   STRICT   provider credential formats. Scanned everywhere, no exemptions.
 *   CONFIG   `SOMETHING_SECRET=<literal>` in config/executable surfaces, where
 *            committed passwords actually hide. Documented placeholder files are
 *            skipped, and any line marked dev_only / example / ${VAR} / $(cmd)
 *            is skipped because it is by definition not a real credential.
 */

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
}

export const STRICT_PATTERNS: { rule: string; re: RegExp }[] = [
  { rule: "private-key", re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { rule: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { rule: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { rule: "stripe-live-key", re: /\bsk_live_[0-9A-Za-z]{16,}\b/ },
  { rule: "npm-token", re: /\bnpm_[A-Za-z0-9]{36}\b/ },
];

/** A literal value assigned to an obviously secret-bearing name. */
export const CONFIG_SECRET = /\b[A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|PASSPHRASE|TOKEN|API_?KEY|ACCESS_KEY)\s*[:=]\s*["']?([^\s"'#]{12,})["']?/;

/** Markers that make a line a documented non-credential. */
export const PLACEHOLDER_MARKERS: RegExp[] = [
  /dev_only/i,
  /example/i,
  /placeholder/i,
  /change_?me/i,
  /replace_?me/i,
  /your[_-]?/i,
  /\$\{/,
  /\$\(/,
  /<[A-Za-z0-9_ -]+>/,
  /\bminioadmin\b/,
  /process\.env/,
];

/** Files that exist to SHOW the shape of a secret. */
const PLACEHOLDER_FILES = [/(^|\/)\.env\.example$/, /\.template$/, /(^|\/)\.env\.sample$/];

/** Surfaces where the CONFIG tier applies. Prose and tests are STRICT-only. */
const CONFIG_SURFACES = [/\.ya?ml$/, /\.json$/, /\.sh$/, /(^|\/)Dockerfile$/, /(^|\/)Caddyfile$/, /\.env[^/]*$/, /\.ts$/, /\.tsx$/];

const SKIP_CONFIG_TIER = [/(^|\/)docs\//, /\.spec\.tsx?$/, /(^|\/)e2e\//, /package-lock\.json$/, /(^|\/)tools\/secret-scan\.ts$/];

const BINARY_LIKE = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|eot|mp4|mp3|wav|onnx|bin)$/i;

function isPlaceholderFile(rel: string): boolean {
  return PLACEHOLDER_FILES.some((re) => re.test(rel));
}

function configTierApplies(rel: string): boolean {
  if (SKIP_CONFIG_TIER.some((re) => re.test(rel))) return false;
  return CONFIG_SURFACES.some((re) => re.test(rel));
}

export function scanText(rel: string, text: string): SecretFinding[] {
  const out: SecretFinding[] = [];
  const placeholderFile = isPlaceholderFile(rel);
  const configTier = configTierApplies(rel);
  text.split(/\r?\n/).forEach((line, index) => {
    for (const { rule, re } of STRICT_PATTERNS) {
      if (re.test(line)) out.push({ file: rel, line: index + 1, rule, excerpt: line.trim().slice(0, 120) });
    }
    if (!configTier || placeholderFile) return;
    if (PLACEHOLDER_MARKERS.some((re) => re.test(line))) return;
    if (CONFIG_SECRET.test(line)) {
      out.push({ file: rel, line: index + 1, rule: "config-secret-literal", excerpt: line.trim().slice(0, 120) });
    }
  });
  return out;
}

export function trackedFiles(root: string): string[] {
  const raw = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString();
  return raw
    .split("\0")
    .filter(Boolean)
    .filter((rel) => !BINARY_LIKE.test(rel));
}

export function scanRepo(root: string, files = trackedFiles(root)): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const rel of files) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    let text: string;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    out.push(...scanText(rel, text));
  }
  return out;
}

function main(): void {
  const root = process.argv[2] ?? process.cwd();
  const files = trackedFiles(root);
  const findings = scanRepo(root, files);
  console.log(`secret scan: ${files.length} tracked files, ${STRICT_PATTERNS.length + 1} patterns`);
  if (findings.length === 0) {
    console.log("secret scan: OK (no credential-shaped literal found)");
    return;
  }
  for (const f of findings) {
    console.error(`::error file=${f.file},line=${f.line}::[${f.rule}] ${f.excerpt}`);
  }
  console.error(`\nsecret scan: FAIL (${findings.length} finding(s))`);
  console.error("Move the value to an env var / secret store. A documented placeholder must say so (dev_only, example, ${VAR}).");
  process.exit(1);
}

const invoked = (process.argv[1] ?? "").replaceAll("\\", "/");
if (invoked.endsWith("tools/secret-scan.ts")) {
  main();
}
