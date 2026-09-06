/**
 * PHI and secret handling rules, shared by the API, the offline client and the
 * conformance suite (فاز ۶ — WEAKNESSES C2, H3, M8, L3).
 *
 * Pure ES: no `node:crypto`, no fs. The browser bundle imports this file, and
 * the conformance rules grep it, so it must stay dependency-free.
 *
 * The design assumption is blunt: a clinical note, a phone number or a patient
 * name must never appear in a log line, an audit `meta` object, the mutation
 * ledger or IndexedDB. Everything below exists to make that mechanical instead
 * of a code-review habit.
 */

export const REDACTED = "[redacted]";

/** Names whose VALUE is patient health information. Compared normalized. */
const PHI_KEYS = new Set([
  "notes",
  "note",
  "notesplain",
  "notestext",
  "comment",
  "diagnosis",
  "medications",
  "complaint",
  "firstname",
  "lastname",
  "fullname",
  "patientname",
  "phone",
  "mobile",
  "email",
  "birthdate",
  "nationalid",
  "address",
  "signaturepayload",
  "signature",
  "signaturedataurl",
]);

/** Names whose VALUE is a credential. Checked before every escape hatch. */
const SECRET_KEYS = new Set([
  "password",
  "passwordhash",
  "passphrase",
  "secret",
  "jwtsecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "jwt",
  "authorization",
  "cookie",
  "setcookie",
  "apikey",
  "privatekey",
  "s3secretkey",
]);

/**
 * Suffixes that make a field derived-and-safe: a ciphertext, a digest or an
 * identifier carries no readable PHI. `notesEncrypted` and `signatureSha256`
 * are the whole point of phase 6, so they must not be flagged.
 */
const DERIVED_SUFFIX = /(encrypted|ciphertext|sha256|digest|checksum|keyid|kid|count|bytes|fields|version|state)$/;

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(normalizeKey(key));
}

export function isPhiKey(key: string): boolean {
  const n = normalizeKey(key);
  if (SECRET_KEYS.has(n)) return true;
  if (DERIVED_SUFFIX.test(n)) return false;
  return PHI_KEYS.has(n);
}

/** Field names an audit `meta` or a ledger row may name (never their values). */
export function isSensitiveKey(key: string): boolean {
  return isPhiKey(key) || isSecretKey(key);
}

/* ── ciphertext envelope ─────────────────────────────────────────────────── */

/**
 * `phi.v1.<kid>.<iv>.<ciphertext>.<tag>` — base64url segments, produced by
 * `@scalpai/db`'s phi-crypto. Recognizing the shape here (and not only in the
 * node package) lets the DB CHECK constraint, the API validators and the web
 * client agree on what "encrypted at rest" means.
 */
export const PHI_CIPHERTEXT_PREFIX = "phi.v1.";
const PHI_CIPHERTEXT_RE = /^phi\.v1\.[a-z0-9][a-z0-9._-]{1,31}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/;

export function isPhiCiphertext(value: unknown): value is string {
  return typeof value === "string" && PHI_CIPHERTEXT_RE.test(value);
}

/* ── audit meta ──────────────────────────────────────────────────────────── */

export const AUDIT_META_MAX_KEYS = 24;
export const AUDIT_META_MAX_STRING = 200;

export class PhiLeakError extends Error {
  constructor(message: string) {
    super(`phi-guard: ${message}`);
    this.name = "PhiLeakError";
  }
}

/**
 * Audit `meta` is metadata, not content. It may carry ids, field NAMES, counts
 * and enum-ish strings. A PHI key is a hard error rather than a silent redaction:
 * the caller wrote a bug and should see it in CI, not in production logs.
 */
export function assertAuditMetaSafe(meta: unknown, path = "meta"): void {
  if (meta === null || meta === undefined) return;
  if (typeof meta !== "object") {
    if (typeof meta === "string" && meta.length > AUDIT_META_MAX_STRING) {
      throw new PhiLeakError(`${path} string exceeds ${AUDIT_META_MAX_STRING} chars`);
    }
    return;
  }
  if (Array.isArray(meta)) {
    meta.forEach((item, i) => assertAuditMetaSafe(item, `${path}[${i}]`));
    return;
  }
  const record = meta as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > AUDIT_META_MAX_KEYS) {
    throw new PhiLeakError(`${path} has ${keys.length} keys (max ${AUDIT_META_MAX_KEYS})`);
  }
  for (const key of keys) {
    const value = record[key];
    if (isSensitiveKey(key) && !isPhiCiphertext(value)) {
      throw new PhiLeakError(`${path}.${key} is PHI/secret and must not be audited`);
    }
    assertAuditMetaSafe(value, `${path}.${key}`);
  }
}

/**
 * The ledger/outbox equivalent: keep the field NAMES so a peer device knows what
 * changed, keep ciphertext as-is, drop every readable PHI value.
 */
export function redactPhiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (isSensitiveKey(key) && !isPhiCiphertext(value)) continue;
    out[key] = value;
  }
  return out;
}

/** Field names present in a payload — the only shape allowed to travel in audit meta. */
export function payloadFieldNames(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).sort();
}

/* ── log scrubbing ───────────────────────────────────────────────────────── */

const FREE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt-redacted]"],
  [/data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]{16,}/gi, "data:[redacted]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, "[email-redacted]"],
  [/\b0\d{10}\b/g, "[phone-redacted]"],
];

export function scrubText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of FREE_TEXT_PATTERNS) out = out.replace(pattern, replacement);
  return out.length > AUDIT_META_MAX_STRING ? `${out.slice(0, AUDIT_META_MAX_STRING)}…` : out;
}

/**
 * Log-safe projection of an arbitrary value: sensitive keys lose their value,
 * free text loses tokens/emails/phones, depth and breadth are bounded so a log
 * line can never become a data export.
 */
export function scrubForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") return scrubText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return scrubText(value.message);
  if (Array.isArray(value)) {
    const head = value.slice(0, 20).map((item) => scrubForLog(item, depth + 1));
    return value.length > 20 ? [...head, `[+${value.length - 20} more]`] : head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) && !isPhiCiphertext(item) ? REDACTED : scrubForLog(item, depth + 1);
    }
    return out;
  }
  return "[unloggable]";
}

/* ── consent signatures (M8) ─────────────────────────────────────────────── */

export const SIGNATURE_MAX_BYTES = 262_144; // 256 KiB — a canvas trace, not a photo
export const SIGNATURE_MIMES = ["image/png", "image/jpeg", "image/svg+xml"] as const;
export type SignatureMime = (typeof SIGNATURE_MIMES)[number];

export interface ParsedSignature {
  mime: SignatureMime;
  base64: string;
  byteLength: number;
}

function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

/**
 * Parse and BOUND a signature data URL. Returning the base64 (instead of bytes)
 * keeps this browser-safe; the API turns it into a Buffer and puts it in MinIO.
 */
export function parseSignatureDataUrl(input: string): ParsedSignature {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(input.trim());
  if (!match) throw new PhiLeakError("signature must be a base64 data URL");
  const mime = match[1]!.toLowerCase();
  const base64 = match[2]!;
  if (!(SIGNATURE_MIMES as readonly string[]).includes(mime)) {
    throw new PhiLeakError(`signature mime ${mime} is not allowed`);
  }
  if (base64.length % 4 !== 0) throw new PhiLeakError("signature base64 is malformed");
  const byteLength = base64ByteLength(base64);
  if (byteLength < 64) throw new PhiLeakError("signature is too small to be a real trace");
  if (byteLength > SIGNATURE_MAX_BYTES) {
    throw new PhiLeakError(`signature is ${byteLength} bytes (max ${SIGNATURE_MAX_BYTES})`);
  }
  return { mime: mime as SignatureMime, base64, byteLength };
}

/* ── consent templates (M8) ──────────────────────────────────────────────── */

/**
 * Versioned templates. A consent row points at an immutable version, so a later
 * wording change can never be back-dated onto a signature that was collected
 * against the old text.
 */
export const CONSENT_TEMPLATES = {
  "v1.0-standard-trichology": { supersededBy: "v1.1-standard-trichology", active: false },
  "v1.1-standard-trichology": { supersededBy: null, active: true },
  "v1.0-photo-release": { supersededBy: null, active: true },
} as const;

export type ConsentTemplateVersion = keyof typeof CONSENT_TEMPLATES;
export const CONSENT_TEMPLATE_VERSIONS = Object.keys(CONSENT_TEMPLATES) as ConsentTemplateVersion[];
export const CONSENT_TEMPLATE_DEFAULT: ConsentTemplateVersion = "v1.1-standard-trichology";

export function isKnownConsentTemplate(version: string): version is ConsentTemplateVersion {
  return Object.prototype.hasOwnProperty.call(CONSENT_TEMPLATES, version);
}

export function isActiveConsentTemplate(version: string): boolean {
  return isKnownConsentTemplate(version) && CONSENT_TEMPLATES[version].active;
}
