/**
 * Deterministic serialization — the single source of truth for anything that is
 * hashed, signed or anchored (WEAKNESSES H17).
 *
 * `JSON.stringify` is NOT deterministic for our purposes: key order follows
 * insertion order, `Date` precision depends on the driver that produced it, and
 * Persian text can arrive in two different Unicode normalizations that compare
 * equal on screen but hash differently. The audit chain, the Merkle anchor and
 * the report seal all recompute hashes from rows that were written by a
 * different process than the one verifying them, so every one of those
 * differences is a false tamper alarm waiting to happen.
 *
 * Rules, in one place:
 *  1. Object keys are sorted by UTF-16 code unit (stable everywhere, no locale).
 *  2. `undefined` object members are dropped; `undefined` in an array is `null`.
 *  3. Strings are NFC-normalized before escaping.
 *  4. Dates and date-like inputs collapse to `toISOString()` — always UTC, always
 *     exactly three fractional digits. Sub-millisecond precision is truncated,
 *     never rounded, so a re-read of the same row cannot drift.
 *  5. Non-finite numbers, functions, symbols and bigints throw instead of
 *     silently serializing to `null`.
 *
 * Pure ES on purpose: the API, the offline client and the conformance suite all
 * import this file.
 */

/** Documented for the ADR and asserted by the regression suite. */
export const CANONICAL_TIMESTAMP_PRECISION_MS = 1;
export const CANONICAL_JSON_VERSION = "cjson.v1";

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(`canonical-json: ${message}`);
    this.name = "CanonicalJsonError";
  }
}

/**
 * One timestamp shape for the whole system: UTC, millisecond precision, `Z`
 * suffix. Truncation (not rounding) keeps `canonicalTimestamp(x)` idempotent.
 */
export function canonicalTimestamp(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) throw new CanonicalJsonError(`invalid timestamp ${String(value)}`);
  return new Date(Math.trunc(ms)).toISOString();
}

function compareKeys(a: string, b: string): number {
  // Code-unit comparison — deterministic across engines and locales, unlike
  // localeCompare which is ICU-data dependent.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalize(value: unknown, path: string, depth: number): string {
  if (depth > 32) throw new CanonicalJsonError(`nesting deeper than 32 at ${path}`);

  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) throw new CanonicalJsonError(`non-finite number at ${path}`);
      // -0 and 0 are the same value; they must not produce different hashes.
      return JSON.stringify(value === 0 ? 0 : value);
    }
    case "string":
      return JSON.stringify(value.normalize("NFC"));
    case "bigint":
      throw new CanonicalJsonError(`bigint at ${path} — convert to string first`);
    case "function":
    case "symbol":
      throw new CanonicalJsonError(`${typeof value} at ${path} is not serializable`);
    case "undefined":
      throw new CanonicalJsonError(`undefined at ${path} — drop the key instead`);
    default:
      break;
  }

  if (value instanceof Date) return JSON.stringify(canonicalTimestamp(value));

  if (Array.isArray(value)) {
    const parts = value.map((item, i) =>
      item === undefined ? "null" : canonicalize(item, `${path}[${i}]`, depth + 1),
    );
    return `[${parts.join(",")}]`;
  }

  if (value instanceof Map || value instanceof Set) {
    throw new CanonicalJsonError(`${value.constructor.name} at ${path} — convert to a plain object/array`);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort(compareKeys);
  const parts = keys.map(
    (k) => `${JSON.stringify(k.normalize("NFC"))}:${canonicalize(record[k], `${path}.${k}`, depth + 1)}`,
  );
  return `{${parts.join(",")}}`;
}

/** Canonical JSON text. Feed THIS to any hash or signature, never JSON.stringify. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value, "$", 0);
}

/**
 * Re-parse convenience for storing a canonical object in a jsonb column: the
 * bytes we hashed and the row we persist come from the same text.
 */
export function canonicalObject<T = unknown>(value: unknown): T {
  return JSON.parse(canonicalJson(value)) as T;
}
