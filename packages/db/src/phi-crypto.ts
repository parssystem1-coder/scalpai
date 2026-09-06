import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson, isPhiCiphertext, PHI_CIPHERTEXT_PREFIX } from "@scalpai/shared";

/**
 * PHI encryption at rest (WEAKNESSES C2).
 *
 * `patients.notes_encrypted` used to be a text column with a reassuring name and
 * plaintext inside it. This module makes the name true:
 *
 *  - AES-256-GCM (authenticated) — not CBC, not pgcrypto's unauthenticated modes.
 *    Ciphertext that was tampered with fails to decrypt instead of decrypting to
 *    garbage.
 *  - The key ring comes from a MOUNTED SECRET (`PHI_KEY_RING_FILE`), the shape a
 *    secret manager / Docker secret / K8s projected volume actually delivers.
 *    Inline `PHI_KEY_RING` stays available for dev and CI.
 *  - Every ciphertext carries the `kid` of the key that produced it, so rotation
 *    is additive: add a new active key, retire the old one, decrypt keeps working
 *    and `rotatePhiCiphertext` re-wraps rows lazily or in a batch.
 *  - AAD binds the ciphertext to its row (clinic + entity + id + field). Copying
 *    a blob from one patient onto another produces an authentication failure, not
 *    a silent identity swap.
 *
 * Envelope: `phi.v1.<kid>.<iv b64url>.<ciphertext b64url>.<tag b64url>`
 */

export const PHI_ENVELOPE_VERSION = "phi.v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KID_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

/** Default rotation window. Overridable, but never unlimited. */
export const PHI_KEY_MAX_AGE_DAYS_DEFAULT = 180;

export class PhiCryptoError extends Error {
  constructor(message: string) {
    super(`phi-crypto: ${message}`);
    this.name = "PhiCryptoError";
  }
}

export interface PhiKey {
  kid: string;
  key: Buffer;
  state: "active" | "retired";
  createdAt: Date;
}

export interface PhiKeyRing {
  active: PhiKey;
  byKid: Map<string, PhiKey>;
  maxAgeDays: number;
}

/** Row-binding material. Every field mixes into the GCM AAD. */
export interface PhiAad {
  clinicId: string;
  entity: string;
  entityId: string;
  field: string;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function aadBytes(aad: PhiAad): Buffer {
  // Canonical JSON so a key-order change can never invalidate stored rows.
  return Buffer.from(
    canonicalJson({
      v: PHI_ENVELOPE_VERSION,
      clinicId: aad.clinicId,
      entity: aad.entity,
      entityId: aad.entityId,
      field: aad.field,
    }),
    "utf8",
  );
}

interface RawKeyEntry {
  kid?: unknown;
  key?: unknown;
  state?: unknown;
  createdAt?: unknown;
}

function parseKeyRing(json: string, source: string): PhiKeyRing {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PhiCryptoError(`${source} is not valid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new PhiCryptoError(`${source} must be a non-empty array of {kid,key,state}`);
  }

  const byKid = new Map<string, PhiKey>();
  let active: PhiKey | null = null;

  for (const entry of parsed as RawKeyEntry[]) {
    const kid = typeof entry.kid === "string" ? entry.kid.trim() : "";
    if (!KID_RE.test(kid)) throw new PhiCryptoError(`${source}: invalid kid '${kid}'`);
    if (byKid.has(kid)) throw new PhiCryptoError(`${source}: duplicate kid '${kid}'`);
    if (typeof entry.key !== "string") throw new PhiCryptoError(`${source}: key for '${kid}' must be base64`);

    const key = Buffer.from(entry.key, "base64");
    if (key.length !== KEY_BYTES) {
      throw new PhiCryptoError(`${source}: key '${kid}' must decode to ${KEY_BYTES} bytes (got ${key.length})`);
    }
    if (key.every((b) => b === key[0])) {
      throw new PhiCryptoError(`${source}: key '${kid}' is a repeated byte — refusing to use it`);
    }

    const state = entry.state === "retired" ? "retired" : entry.state === "active" ? "active" : null;
    if (!state) throw new PhiCryptoError(`${source}: key '${kid}' needs state 'active' or 'retired'`);

    const createdAt = entry.createdAt ? new Date(String(entry.createdAt)) : new Date(0);
    if (Number.isNaN(createdAt.getTime())) {
      throw new PhiCryptoError(`${source}: key '${kid}' has an invalid createdAt`);
    }

    const phiKey: PhiKey = { kid, key, state, createdAt };
    byKid.set(kid, phiKey);
    if (state === "active") {
      if (active) throw new PhiCryptoError(`${source}: more than one active key ('${active.kid}' and '${kid}')`);
      active = phiKey;
    }
  }

  if (!active) throw new PhiCryptoError(`${source}: no active key — new writes would have nothing to encrypt with`);

  const rawMaxAge = process.env.PHI_KEY_MAX_AGE_DAYS?.trim();
  const maxAgeDays = rawMaxAge ? Number(rawMaxAge) : PHI_KEY_MAX_AGE_DAYS_DEFAULT;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    throw new PhiCryptoError("PHI_KEY_MAX_AGE_DAYS must be a positive number of days");
  }

  return { active, byKid, maxAgeDays };
}

let cached: PhiKeyRing | null = null;

/**
 * Load the key ring. File first: an env var shows up in `docker inspect`, a
 * mounted secret does not.
 */
export function loadPhiKeyRing(): PhiKeyRing {
  if (cached) return cached;

  const file = process.env.PHI_KEY_RING_FILE?.trim();
  if (file) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      throw new PhiCryptoError(`PHI_KEY_RING_FILE '${file}' could not be read`);
    }
    cached = parseKeyRing(contents, "PHI_KEY_RING_FILE");
    return cached;
  }

  const inline = process.env.PHI_KEY_RING?.trim();
  if (inline) {
    cached = parseKeyRing(inline, "PHI_KEY_RING");
    return cached;
  }

  throw new PhiCryptoError(
    "no PHI key material — set PHI_KEY_RING_FILE (mounted secret) or PHI_KEY_RING. There is no plaintext fallback.",
  );
}

/** Tests mutate env between cases; production never calls this. */
export function resetPhiKeyRingCache(): void {
  cached = null;
}

/** Rotation policy surface: is the active key past its window? (R12-style) */
export function phiKeyRotationStatus(now: Date = new Date()): {
  kid: string;
  ageDays: number;
  maxAgeDays: number;
  overdue: boolean;
} {
  const ring = loadPhiKeyRing();
  const ageDays = (now.getTime() - ring.active.createdAt.getTime()) / 86_400_000;
  return {
    kid: ring.active.kid,
    ageDays: Math.floor(ageDays),
    maxAgeDays: ring.maxAgeDays,
    overdue: ageDays > ring.maxAgeDays,
  };
}

/** Generate key material for `ops` / dev bootstrap. Never derived from a password. */
export function generatePhiKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

export function phiCiphertextKid(token: string): string | null {
  if (!isPhiCiphertext(token)) return null;
  return token.slice(PHI_CIPHERTEXT_PREFIX.length).split(".")[0] ?? null;
}

export function encryptPhi(plaintext: string, aad: PhiAad): string {
  if (typeof plaintext !== "string") throw new PhiCryptoError("plaintext must be a string");
  const ring = loadPhiKeyRing();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", ring.active.key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadBytes(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PHI_ENVELOPE_VERSION, ring.active.kid, b64url(iv), b64url(ciphertext), b64url(tag)].join(".");
}

export function decryptPhi(token: string, aad: PhiAad): string {
  if (!isPhiCiphertext(token)) throw new PhiCryptoError("value is not a phi.v1 envelope");
  const [, , kid, ivPart, ctPart, tagPart] = token.split(".");
  const ring = loadPhiKeyRing();
  const key = ring.byKid.get(kid!);
  if (!key) throw new PhiCryptoError(`unknown kid '${kid}' — the key ring is missing a retired key`);

  const decipher = createDecipheriv("aes-256-gcm", key.key, Buffer.from(ivPart!, "base64url"), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(aadBytes(aad));
  decipher.setAuthTag(Buffer.from(tagPart!, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ctPart!, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, tampered ciphertext, or a row/field the blob does not belong to.
    throw new PhiCryptoError("authentication failed — ciphertext, key or row binding does not match");
  }
}

/**
 * Re-wrap a ciphertext under the active key. Returns null when it is already
 * current, so a batch job can skip untouched rows cheaply.
 */
export function rotatePhiCiphertext(token: string, aad: PhiAad): string | null {
  const ring = loadPhiKeyRing();
  if (phiCiphertextKid(token) === ring.active.kid) return null;
  return encryptPhi(decryptPhi(token, aad), aad);
}

/** Guard for write paths: refuse to persist anything that is not an envelope. */
export function assertEncryptedAtRest(value: unknown, field: string): void {
  if (value === null || value === undefined) return;
  if (!isPhiCiphertext(value)) {
    throw new PhiCryptoError(`${field} must be a phi.v1 ciphertext before it touches the database`);
  }
}

/** Stable fingerprint for evidence/reports — never reversible to the note. */
export function phiFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}
