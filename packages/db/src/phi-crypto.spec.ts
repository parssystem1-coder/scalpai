import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PhiCryptoError,
  assertEncryptedAtRest,
  decryptPhi,
  encryptPhi,
  generatePhiKey,
  loadPhiKeyRing,
  phiCiphertextKid,
  phiKeyRotationStatus,
  resetPhiKeyRingCache,
  rotatePhiCiphertext,
  type PhiAad,
} from "./phi-crypto.js";
import { isPhiCiphertext } from "@scalpai/shared";

const KEY_A = Buffer.from("a".repeat(31) + "b").toString("base64");
const KEY_B = Buffer.from("c".repeat(31) + "d").toString("base64");

const AAD: PhiAad = {
  clinicId: "11111111-1111-1111-1111-111111111111",
  entity: "patient",
  entityId: "22222222-2222-2222-2222-222222222222",
  field: "notes",
};

const NOTE = "بیمار از خارش و ریزش ناحیه فرونتال شکایت دارد — دوز فیناستراید ۱mg";

function setRing(entries: unknown): void {
  process.env.PHI_KEY_RING = JSON.stringify(entries);
  delete process.env.PHI_KEY_RING_FILE;
  resetPhiKeyRingCache();
}

const saved = { ring: process.env.PHI_KEY_RING, file: process.env.PHI_KEY_RING_FILE, age: process.env.PHI_KEY_MAX_AGE_DAYS };

beforeEach(() => {
  setRing([{ kid: "k2026a", key: KEY_A, state: "active", createdAt: "2026-09-01T00:00:00.000Z" }]);
});

afterEach(() => {
  if (saved.ring === undefined) delete process.env.PHI_KEY_RING;
  else process.env.PHI_KEY_RING = saved.ring;
  if (saved.file === undefined) delete process.env.PHI_KEY_RING_FILE;
  else process.env.PHI_KEY_RING_FILE = saved.file;
  if (saved.age === undefined) delete process.env.PHI_KEY_MAX_AGE_DAYS;
  else process.env.PHI_KEY_MAX_AGE_DAYS = saved.age;
  resetPhiKeyRingCache();
});

describe("PHI envelope encryption (C2)", () => {
  it("round-trips a clinical note and tags the key id", () => {
    const token = encryptPhi(NOTE, AAD);
    expect(isPhiCiphertext(token)).toBe(true);
    expect(token).not.toContain("خارش");
    expect(phiCiphertextKid(token)).toBe("k2026a");
    expect(decryptPhi(token, AAD)).toBe(NOTE);
  });

  it("produces a fresh IV per call — identical notes are not identical ciphertext", () => {
    expect(encryptPhi(NOTE, AAD)).not.toBe(encryptPhi(NOTE, AAD));
  });

  it("fails authentication when the ciphertext is tampered with", () => {
    const token = encryptPhi(NOTE, AAD);
    const parts = token.split(".");
    const body = Buffer.from(parts[4]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    parts[4] = body.toString("base64url");
    expect(() => decryptPhi(parts.join("."), AAD)).toThrow(PhiCryptoError);
  });

  it("refuses a blob moved to another patient or another field (AAD binding)", () => {
    const token = encryptPhi(NOTE, AAD);
    expect(() => decryptPhi(token, { ...AAD, entityId: "33333333-3333-3333-3333-333333333333" })).toThrow(PhiCryptoError);
    expect(() => decryptPhi(token, { ...AAD, field: "complaint" })).toThrow(PhiCryptoError);
    expect(() => decryptPhi(token, { ...AAD, clinicId: "44444444-4444-4444-4444-444444444444" })).toThrow(PhiCryptoError);
  });
});

describe("key ring loading", () => {
  it("has no plaintext fallback", () => {
    delete process.env.PHI_KEY_RING;
    delete process.env.PHI_KEY_RING_FILE;
    resetPhiKeyRingCache();
    expect(() => loadPhiKeyRing()).toThrow(/no PHI key material/);
  });

  it("rejects short keys, duplicate kids and more than one active key", () => {
    setRing([{ kid: "short", key: Buffer.from("tooshort").toString("base64"), state: "active" }]);
    expect(() => loadPhiKeyRing()).toThrow(/32 bytes/);

    setRing([
      { kid: "dup", key: KEY_A, state: "active" },
      { kid: "dup", key: KEY_B, state: "retired" },
    ]);
    expect(() => loadPhiKeyRing()).toThrow(/duplicate kid/);

    setRing([
      { kid: "one", key: KEY_A, state: "active" },
      { kid: "two", key: KEY_B, state: "active" },
    ]);
    expect(() => loadPhiKeyRing()).toThrow(/more than one active key/);

    setRing([{ kid: "onlyretired", key: KEY_A, state: "retired" }]);
    expect(() => loadPhiKeyRing()).toThrow(/no active key/);
  });

  it("generates 32-byte key material", () => {
    expect(Buffer.from(generatePhiKey(), "base64")).toHaveLength(32);
  });
});

describe("rotation policy", () => {
  it("re-wraps a retired-key ciphertext and skips current ones", () => {
    const old = encryptPhi(NOTE, AAD);

    setRing([
      { kid: "k2026a", key: KEY_A, state: "retired", createdAt: "2026-03-01T00:00:00.000Z" },
      { kid: "k2026b", key: KEY_B, state: "active", createdAt: "2026-09-01T00:00:00.000Z" },
    ]);

    const rotated = rotatePhiCiphertext(old, AAD);
    expect(rotated).toBeTruthy();
    expect(phiCiphertextKid(rotated!)).toBe("k2026b");
    expect(decryptPhi(rotated!, AAD)).toBe(NOTE);
    // still readable through the retired key — rotation is additive
    expect(decryptPhi(old, AAD)).toBe(NOTE);
    expect(rotatePhiCiphertext(rotated!, AAD)).toBeNull();
  });

  it("reports an overdue active key instead of silently keeping it forever", () => {
    process.env.PHI_KEY_MAX_AGE_DAYS = "30";
    setRing([{ kid: "k2026a", key: KEY_A, state: "active", createdAt: "2026-01-01T00:00:00.000Z" }]);
    const status = phiKeyRotationStatus(new Date("2026-09-06T00:00:00.000Z"));
    expect(status.overdue).toBe(true);
    expect(status.maxAgeDays).toBe(30);
  });
});

describe("write-path guard", () => {
  it("blocks plaintext from reaching the database", () => {
    expect(() => assertEncryptedAtRest(NOTE, "notesEncrypted")).toThrow(PhiCryptoError);
    expect(() => assertEncryptedAtRest(null, "notesEncrypted")).not.toThrow();
    expect(() => assertEncryptedAtRest(encryptPhi(NOTE, AAD), "notesEncrypted")).not.toThrow();
  });
});
