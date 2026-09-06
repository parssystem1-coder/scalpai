import { describe, expect, it } from "vitest";
import {
  PhiLeakError,
  REDACTED,
  assertAuditMetaSafe,
  isActiveConsentTemplate,
  isKnownConsentTemplate,
  isPhiCiphertext,
  isPhiKey,
  isSecretKey,
  parseSignatureDataUrl,
  payloadFieldNames,
  redactPhiPayload,
  scrubForLog,
  scrubText,
} from "./phi.js";

const CIPHERTEXT = "phi.v1.k2026a.AAAAAAAAAAAAAAAA.Zm9vYmFyYmF6cXV1eA.AAAAAAAAAAAAAAAAAAAAAA";

describe("PHI field classification", () => {
  it("flags readable PHI and credentials", () => {
    for (const key of ["notes", "note", "firstName", "phone", "birth_date", "signaturePayload"]) {
      expect(isPhiKey(key)).toBe(true);
    }
    for (const key of ["password", "refresh_token", "Authorization", "apiKey"]) {
      expect(isSecretKey(key)).toBe(true);
    }
  });

  it("does NOT flag derived, non-readable fields", () => {
    for (const key of ["notesEncrypted", "notesKeyId", "signatureSha256", "signatureBytes", "fields"]) {
      expect(isPhiKey(key)).toBe(false);
    }
  });

  it("recognizes the ciphertext envelope", () => {
    expect(isPhiCiphertext(CIPHERTEXT)).toBe(true);
    expect(isPhiCiphertext("موی چرب، خارش پوست سر")).toBe(false);
    expect(isPhiCiphertext("phi.v1.short")).toBe(false);
  });
});

describe("audit meta guard (H17)", () => {
  it("accepts field names, ids and counts", () => {
    expect(() => assertAuditMetaSafe({ fields: ["notes", "phone"], patientId: "p1", count: 3 })).not.toThrow();
  });

  it("rejects a raw note or a token smuggled into meta", () => {
    expect(() => assertAuditMetaSafe({ notes: "خارش شدید" })).toThrow(PhiLeakError);
    expect(() => assertAuditMetaSafe({ nested: { refreshToken: "abc" } })).toThrow(PhiLeakError);
  });

  it("allows ciphertext under a PHI key name", () => {
    expect(() => assertAuditMetaSafe({ notes: CIPHERTEXT })).not.toThrow();
  });

  it("caps meta breadth", () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 40; i++) wide[`k${i}`] = i;
    expect(() => assertAuditMetaSafe(wide)).toThrow(PhiLeakError);
  });
});

describe("ledger redaction (H3)", () => {
  it("keeps ciphertext and structural fields, drops readable PHI", () => {
    const out = redactPhiPayload({
      id: "p1",
      notes: "متن خام یادداشت",
      notesEncrypted: CIPHERTEXT,
      firstName: "علی",
      tags: ["vip"],
    });
    expect(out).toEqual({ id: "p1", notesEncrypted: CIPHERTEXT, tags: ["vip"] });
    expect(payloadFieldNames(out)).toEqual(["id", "notesEncrypted", "tags"]);
  });
});

describe("log scrubbing (L3)", () => {
  it("strips tokens, emails, phones and data URLs from free text", () => {
    expect(scrubText("Authorization: Bearer abcdefghijkl")).toContain("Bearer [redacted]");
    expect(scrubText("user owner@clinic-a.test failed")).toContain("[email-redacted]");
    expect(scrubText("phone 09123456789 duplicate")).toContain("[phone-redacted]");
    expect(scrubText("img data:image/png;base64,AAAAAAAAAAAAAAAAAAAA")).toContain("data:[redacted]");
  });

  it("redacts sensitive keys and bounds structure", () => {
    const scrubbed = scrubForLog({ password: "hunter22", notes: "خارش", patientId: "p1" }) as Record<string, unknown>;
    expect(scrubbed.password).toBe(REDACTED);
    expect(scrubbed.notes).toBe(REDACTED);
    expect(scrubbed.patientId).toBe("p1");
    const long = scrubForLog(Array.from({ length: 50 }, (_, i) => i)) as unknown[];
    expect(long).toHaveLength(21);
  });
});

describe("consent signatures and templates (M8)", () => {
  const png = `data:image/png;base64,${"A".repeat(400)}`;

  it("accepts a bounded png trace", () => {
    const parsed = parseSignatureDataUrl(png);
    expect(parsed.mime).toBe("image/png");
    expect(parsed.byteLength).toBe(300);
  });

  it("rejects wrong mime, oversize and non-data-URL payloads", () => {
    expect(() => parseSignatureDataUrl(`data:application/pdf;base64,${"A".repeat(400)}`)).toThrow(PhiLeakError);
    expect(() => parseSignatureDataUrl(`data:image/png;base64,${"A".repeat(400_000)}`)).toThrow(PhiLeakError);
    expect(() => parseSignatureDataUrl("just-a-string")).toThrow(PhiLeakError);
    expect(() => parseSignatureDataUrl("data:image/png;base64,QUFB")).toThrow(PhiLeakError);
  });

  it("knows which template versions exist and which are still active", () => {
    expect(isKnownConsentTemplate("v1.0-standard-trichology")).toBe(true);
    expect(isActiveConsentTemplate("v1.0-standard-trichology")).toBe(false);
    expect(isActiveConsentTemplate("v1.1-standard-trichology")).toBe(true);
    expect(isKnownConsentTemplate("v9-made-up")).toBe(false);
  });
});
