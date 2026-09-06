import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { asc, eq } from "drizzle-orm";
import { canonicalJson, canonicalTimestamp } from "@scalpai/shared";
import { auditAnchors, auditLog } from "./schema.js";
import { computeAuditRowHash, type AuditRowInput } from "./audit-hash.js";
import {
  buildMerkleTree,
  merkleInclusionProof,
  verifyMerkleInclusion,
  type MerkleInclusionProof,
} from "./merkle.js";
import type { Tx } from "./tenant.js";

/**
 * Audit evidence (WEAKNESSES H17, ADR-0038).
 *
 * Three things were wrong before:
 *  1. `verifyAuditChainIntegrity` only compared `prevHash` links. Rewriting a
 *     row's content AND its `row_hash` passed as clean. It now RECOMPUTES every
 *     row hash from the canonical payload.
 *  2. The "Merkle anchor" was `sha256(h1:h2:…)` — a chained digest with no tree
 *     and no way to prove a single row. It is a real tree now, with inclusion
 *     proofs (see merkle.ts).
 *  3. The anchor existed only as a return value. It is now persisted in
 *     `audit_anchors` (insert-only at the RLS level) AND written to an external
 *     write-once file, signed with Ed25519.
 */

export const ANCHOR_VERSION = "anchor.v1";

export class AuditAnchorError extends Error {
  constructor(message: string) {
    super(`audit-anchor: ${message}`);
    this.name = "AuditAnchorError";
  }
}

export interface AuditAnchor {
  version: typeof ANCHOR_VERSION;
  clinicId: string;
  treeSize: number;
  firstLogId: string;
  lastLogId: string;
  lastRowHash: string;
  merkleRoot: string;
  createdAt: string;
}

export interface SignedAuditAnchor {
  anchor: AuditAnchor;
  keyId: string | null;
  signature: string | null;
  wormUri: string | null;
}

/* ── chain verification ────────────────────────────────────────────────── */

export interface AuditChainRow extends AuditRowInput {
  id: string | number;
  prevHash: string | null;
  rowHash: string;
}

export interface AuditChainVerdict {
  ok: boolean;
  checked: number;
  /** First problem found, with the row that caused it. */
  failure: { id: string; reason: "row-hash-mismatch" | "broken-link" | "clinic-mixed" } | null;
}

/**
 * Recompute the whole chain. Rows must arrive in `id` order and belong to ONE
 * clinic (the chain is per-clinic by construction — W21/M12).
 */
export function verifyAuditChain(rows: readonly AuditChainRow[]): AuditChainVerdict {
  let prev: string | null = null;
  const clinic = rows[0]?.clinicId ?? null;

  for (const row of rows) {
    const id = String(row.id);
    if (row.clinicId !== clinic) {
      return { ok: false, checked: rows.length, failure: { id, reason: "clinic-mixed" } };
    }
    if (row.prevHash !== prev) {
      return { ok: false, checked: rows.length, failure: { id, reason: "broken-link" } };
    }
    if (computeAuditRowHash(row, prev) !== row.rowHash) {
      return { ok: false, checked: rows.length, failure: { id, reason: "row-hash-mismatch" } };
    }
    prev = row.rowHash;
  }
  return { ok: true, checked: rows.length, failure: null };
}

/** Boolean form kept for existing call sites. */
export function verifyAuditChainIntegrity(rows: readonly AuditChainRow[]): boolean {
  return verifyAuditChain(rows).ok;
}

async function loadClinicChain(tx: Tx, clinicId: string): Promise<AuditChainRow[]> {
  const rows = await tx
    .select()
    .from(auditLog)
    .where(eq(auditLog.clinicId, clinicId))
    .orderBy(asc(auditLog.id));
  return rows.map((r) => ({
    id: r.id,
    clinicId: r.clinicId,
    userId: r.userId,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    meta: r.meta ?? null,
    at: r.at as Date,
    prevHash: r.prevHash,
    rowHash: r.rowHash,
  }));
}

/* ── signing ────────────────────────────────────────────────────────── */

function anchorPrivateKey(): string | null {
  const file = process.env.AUDIT_ANCHOR_SIGNING_KEY_FILE?.trim();
  if (file) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      throw new AuditAnchorError(`AUDIT_ANCHOR_SIGNING_KEY_FILE '${file}' could not be read`);
    }
  }
  const inline = process.env.AUDIT_ANCHOR_SIGNING_KEY?.trim();
  return inline ? inline.replace(/\\n/g, "\n") : null;
}

export function anchorKeyId(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

export function signAnchor(anchor: AuditAnchor): { keyId: string; signature: string } | null {
  const pem = anchorPrivateKey();
  if (!pem) return null;
  const priv = createPrivateKey(pem);
  const pub = createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
  return {
    keyId: anchorKeyId(pub),
    signature: sign(null, Buffer.from(canonicalJson(anchor), "utf8"), priv).toString("base64url"),
  };
}

export function verifyAnchorSignature(anchor: AuditAnchor, signature: string, publicKeyPem: string): boolean {
  try {
    return verify(
      null,
      Buffer.from(canonicalJson(anchor), "utf8"),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}

/* ── external WORM sink ──────────────────────────────────────────────── */

/**
 * Write the signed anchor outside the database. `wx` + read-only mode is the
 * cheap, local half of WORM: the process that wrote it cannot overwrite it, and
 * the directory is meant to be an object-lock/immutable mount in production.
 */
export function writeAnchorToWorm(signed: SignedAuditAnchor): string | null {
  const dir = process.env.AUDIT_ANCHOR_WORM_DIR?.trim();
  if (!dir) return null;
  const stamp = signed.anchor.createdAt.replace(/[:.]/g, "-");
  const target = resolve(join(dir, signed.anchor.clinicId, `${stamp}-${signed.anchor.lastLogId}.anchor.json`));
  mkdirSync(dirname(target), { recursive: true });
  const body = `${canonicalJson({ anchor: signed.anchor, keyId: signed.keyId, signature: signed.signature })}\n`;
  try {
    writeFileSync(target, body, { flag: "wx", mode: 0o444 });
    chmodSync(target, 0o444);
  } catch (err) {
    if ((err as { code?: string }).code === "EEXIST") {
      throw new AuditAnchorError(`WORM file ${target} already exists — refusing to overwrite an anchor`);
    }
    throw err;
  }
  return target;
}

export function readAnchorFile(path: string): { anchor: AuditAnchor; keyId: string | null; signature: string | null } {
  return JSON.parse(readFileSync(path, "utf8")) as {
    anchor: AuditAnchor;
    keyId: string | null;
    signature: string | null;
  };
}

/* ── anchor generation + verification ────────────────────────────────────── */

/** Pure part: build the anchor from an already-verified chain. */
export function buildAnchor(clinicId: string, rows: readonly AuditChainRow[], now: Date = new Date()): AuditAnchor {
  if (rows.length === 0) throw new AuditAnchorError("cannot anchor an empty chain");
  const tree = buildMerkleTree(rows.map((r) => r.rowHash));
  return {
    version: ANCHOR_VERSION,
    clinicId,
    treeSize: tree.size,
    firstLogId: String(rows[0]!.id),
    lastLogId: String(rows[rows.length - 1]!.id),
    lastRowHash: rows[rows.length - 1]!.rowHash,
    merkleRoot: tree.root,
    createdAt: canonicalTimestamp(now),
  };
}

/**
 * Anchor a clinic's audit trail. Refuses to publish an anchor for a chain that
 * does not verify — a signed root over tampered rows would be worse than none.
 */
export async function generateClinicAuditAnchor(
  tx: Tx,
  clinicId: string,
  opts: { persist?: boolean; now?: Date } = {},
): Promise<SignedAuditAnchor | null> {
  const rows = await loadClinicChain(tx, clinicId);
  if (rows.length === 0) return null;

  const verdict = verifyAuditChain(rows);
  if (!verdict.ok) {
    throw new AuditAnchorError(
      `chain for clinic ${clinicId} failed verification at row ${verdict.failure?.id} (${verdict.failure?.reason}) — not anchoring`,
    );
  }

  const anchor = buildAnchor(clinicId, rows, opts.now);
  const sig = signAnchor(anchor);
  const signed: SignedAuditAnchor = {
    anchor,
    keyId: sig?.keyId ?? null,
    signature: sig?.signature ?? null,
    wormUri: null,
  };
  signed.wormUri = writeAnchorToWorm(signed);

  if (opts.persist !== false) {
    await tx.insert(auditAnchors).values({
      clinicId,
      treeSize: anchor.treeSize,
      firstLogId: Number(anchor.firstLogId),
      lastLogId: Number(anchor.lastLogId),
      lastRowHash: anchor.lastRowHash,
      merkleRoot: anchor.merkleRoot,
      keyId: signed.keyId,
      signature: signed.signature,
      wormUri: signed.wormUri,
    });
  }

  return signed;
}

/** Inclusion proof for ONE audit row — the thing a chained digest could never give. */
export async function auditInclusionProof(
  tx: Tx,
  clinicId: string,
  logId: number,
): Promise<{ proof: MerkleInclusionProof; root: string } | null> {
  const rows = await loadClinicChain(tx, clinicId);
  const index = rows.findIndex((r) => Number(r.id) === logId);
  if (index < 0) return null;
  const hashes = rows.map((r) => r.rowHash);
  const tree = buildMerkleTree(hashes);
  return { proof: merkleInclusionProof(hashes, index), root: tree.root };
}

export function verifyAuditInclusion(proof: MerkleInclusionProof, root: string): boolean {
  return verifyMerkleInclusion(proof, root);
}

/**
 * Re-verify a stored anchor against the live table: recompute the chain, rebuild
 * the tree and compare the root. This is what the nightly/ops job asserts.
 */
export async function verifyStoredAnchor(
  tx: Tx,
  anchorId: string,
  publicKeyPem?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const stored = await tx.select().from(auditAnchors).where(eq(auditAnchors.id, anchorId)).limit(1);
  const record = stored[0];
  if (!record) return { ok: false, reason: "anchor not found" };

  const rows = (await loadClinicChain(tx, record.clinicId)).filter((r) => Number(r.id) <= record.lastLogId);
  const verdict = verifyAuditChain(rows);
  if (!verdict.ok) return { ok: false, reason: `chain broken at row ${verdict.failure?.id}` };
  if (rows.length !== record.treeSize) return { ok: false, reason: "tree size changed" };

  const rebuilt = buildMerkleTree(rows.map((r) => r.rowHash));
  if (rebuilt.root !== record.merkleRoot) return { ok: false, reason: "merkle root mismatch" };

  const pem = publicKeyPem ?? process.env.AUDIT_ANCHOR_PUBLIC_KEY?.trim()?.replace(/\\n/g, "\n");
  if (record.signature && pem) {
    const anchor: AuditAnchor = {
      version: ANCHOR_VERSION,
      clinicId: record.clinicId,
      treeSize: record.treeSize,
      firstLogId: String(record.firstLogId),
      lastLogId: String(record.lastLogId),
      lastRowHash: record.lastRowHash,
      merkleRoot: record.merkleRoot,
      createdAt: canonicalTimestamp(record.createdAt as Date),
    };
    if (!verifyAnchorSignature(anchor, record.signature, pem)) {
      return { ok: false, reason: "anchor signature invalid" };
    }
  }

  return { ok: true };
}
