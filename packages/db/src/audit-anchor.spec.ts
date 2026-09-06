import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  ANCHOR_VERSION,
  AuditAnchorError,
  buildAnchor,
  signAnchor,
  verifyAnchorSignature,
  verifyAuditChain,
  verifyAuditChainIntegrity,
  type AuditChainRow,
} from "./audit-anchor.js";
import { computeAuditRowHash } from "./audit-hash.js";
import { buildMerkleTree, merkleInclusionProof, verifyMerkleInclusion } from "./merkle.js";

const CLINIC = "11111111-1111-1111-1111-111111111111";

/** Build a chain exactly the way appendAudit does — canonical payload + prev hash. */
function chain(count: number): AuditChainRow[] {
  const rows: AuditChainRow[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= count; i++) {
    const base = {
      clinicId: CLINIC,
      userId: "22222222-2222-2222-2222-222222222222",
      action: ["patient.create", "consent.create", "analysis.create"][i % 3]!,
      entity: "patient",
      entityId: `entity-${i}`,
      meta: { fields: ["notes"], seq: i },
      at: new Date(1_757_000_000_000 + i * 1000),
    };
    const rowHash = computeAuditRowHash(base, prev);
    rows.push({ ...base, id: i, prevHash: prev, rowHash });
    prev = rowHash;
  }
  return rows;
}

describe("audit chain verification (H17)", () => {
  it("accepts a chain written by the canonical hash definition", () => {
    const verdict = verifyAuditChain(chain(5));
    expect(verdict.ok).toBe(true);
    expect(verdict.checked).toBe(5);
    expect(verifyAuditChainIntegrity(chain(5))).toBe(true);
  });

  it("catches a rewritten row even when its row_hash was rewritten to match", () => {
    // This is the case the old link-only check waved through: content AND hash
    // changed together, prev/next links still consistent.
    const rows = chain(4);
    const target = rows[2]!;
    const forged = { ...target, action: "patient.delete" };
    forged.rowHash = computeAuditRowHash(forged, target.prevHash);
    rows[2] = forged;

    const verdict = verifyAuditChain(rows);
    expect(verdict.ok).toBe(false);
    // the forged row itself recomputes fine, so the break shows on the NEXT link
    expect(verdict.failure?.id).toBe("4");
  });

  it("catches an edited row whose hash was left alone", () => {
    const rows = chain(3);
    rows[1] = { ...rows[1]!, entityId: "tampered" };
    const verdict = verifyAuditChain(rows);
    expect(verdict.ok).toBe(false);
    expect(verdict.failure).toEqual({ id: "2", reason: "row-hash-mismatch" });
  });

  it("catches a broken prev link and a cross-clinic splice", () => {
    const broken = chain(3);
    broken[1] = { ...broken[1]!, prevHash: "deadbeef" };
    expect(verifyAuditChain(broken).failure?.reason).toBe("broken-link");

    const mixed = chain(3);
    mixed[2] = { ...mixed[2]!, clinicId: "99999999-9999-9999-9999-999999999999" };
    expect(verifyAuditChain(mixed).failure?.reason).toBe("clinic-mixed");
  });

  it("is insensitive to meta key order (canonical payload)", () => {
    const rows = chain(2);
    const reordered = { ...rows[1]!, meta: { seq: 2, fields: ["notes"] } };
    expect(computeAuditRowHash(reordered, rows[1]!.prevHash)).toBe(rows[1]!.rowHash);
  });
});

describe("anchor (H17)", () => {
  it("publishes a real Merkle root with per-row inclusion proofs", () => {
    const rows = chain(7);
    const anchor = buildAnchor(CLINIC, rows, new Date("2026-09-06T12:00:00.000Z"));

    expect(anchor.version).toBe(ANCHOR_VERSION);
    expect(anchor.treeSize).toBe(7);
    expect(anchor.firstLogId).toBe("1");
    expect(anchor.lastLogId).toBe("7");
    expect(anchor.merkleRoot).toMatch(/^[0-9a-f]{64}$/);

    const hashes = rows.map((r) => r.rowHash);
    const tree = buildMerkleTree(hashes);
    expect(tree.root).toBe(anchor.merkleRoot);
    for (let i = 0; i < hashes.length; i++) {
      expect(verifyMerkleInclusion(merkleInclusionProof(hashes, i), anchor.merkleRoot)).toBe(true);
    }
  });

  it("refuses to anchor nothing", () => {
    expect(() => buildAnchor(CLINIC, [])).toThrow(AuditAnchorError);
  });

  it("signs and verifies the anchor, and rejects a mutated one", () => {
    const keys = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }) as unknown as { privateKey: string; publicKey: string };

    const saved = process.env.AUDIT_ANCHOR_SIGNING_KEY;
    process.env.AUDIT_ANCHOR_SIGNING_KEY = keys.privateKey;
    try {
      const anchor = buildAnchor(CLINIC, chain(4), new Date("2026-09-06T12:00:00.000Z"));
      const signed = signAnchor(anchor);
      expect(signed).toBeTruthy();
      expect(verifyAnchorSignature(anchor, signed!.signature, keys.publicKey)).toBe(true);
      expect(verifyAnchorSignature({ ...anchor, treeSize: 5 }, signed!.signature, keys.publicKey)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.AUDIT_ANCHOR_SIGNING_KEY;
      else process.env.AUDIT_ANCHOR_SIGNING_KEY = saved;
    }
  });

  it("returns an unsigned anchor rather than a fake signature when no key exists", () => {
    const saved = process.env.AUDIT_ANCHOR_SIGNING_KEY;
    delete process.env.AUDIT_ANCHOR_SIGNING_KEY;
    try {
      expect(signAnchor(buildAnchor(CLINIC, chain(2)))).toBeNull();
    } finally {
      if (saved !== undefined) process.env.AUDIT_ANCHOR_SIGNING_KEY = saved;
    }
  });
});
