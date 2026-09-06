import { createHash } from "node:crypto";

/**
 * A real Merkle tree, because the anchor used to claim one (WEAKNESSES H17).
 *
 * The previous "merkleAnchorHash" was `sha256(rowHash1:rowHash2:…)` — a single
 * chained digest. That proves nothing beyond the hash chain we already had: you
 * cannot show that one specific audit row is included without replaying every
 * row. This module builds the tree properly and issues inclusion proofs, so an
 * auditor can verify a single row against a published root.
 *
 * RFC 6962 conventions:
 *  - leaf hash  = sha256(0x00 || leaf bytes)
 *  - node hash  = sha256(0x01 || left || right)
 *  - an odd node at any level is PROMOTED, never duplicated. Duplicating the
 *    last node makes two different trees share a root (CVE-2012-2459).
 */

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

/** sha256 of the empty string — the agreed root for a tree with no leaves. */
export const EMPTY_MERKLE_ROOT = createHash("sha256").update(Buffer.alloc(0)).digest("hex");

export interface MerkleTree {
  root: string;
  size: number;
  /** levels[0] = leaf hashes, last level = [root]. */
  levels: string[][];
}

export interface MerkleProofStep {
  hash: string;
  side: "left" | "right";
}

export interface MerkleInclusionProof {
  index: number;
  size: number;
  leafHash: string;
  path: MerkleProofStep[];
}

function hex(buf: Buffer): string {
  return buf.toString("hex");
}

function toLeafBytes(leaf: string): Buffer {
  // Audit row hashes are hex; anything else is hashed as UTF-8 text.
  return /^[0-9a-f]{64}$/i.test(leaf) ? Buffer.from(leaf, "hex") : Buffer.from(leaf, "utf8");
}

export function merkleLeafHash(leaf: string): string {
  return hex(createHash("sha256").update(Buffer.concat([LEAF_PREFIX, toLeafBytes(leaf)])).digest());
}

export function merkleNodeHash(left: string, right: string): string {
  return hex(
    createHash("sha256")
      .update(Buffer.concat([NODE_PREFIX, Buffer.from(left, "hex"), Buffer.from(right, "hex")]))
      .digest(),
  );
}

export function buildMerkleTree(leaves: readonly string[]): MerkleTree {
  if (leaves.length === 0) return { root: EMPTY_MERKLE_ROOT, size: 0, levels: [[]] };

  const levels: string[][] = [leaves.map(merkleLeafHash)];
  while (levels[levels.length - 1]!.length > 1) {
    const current = levels[levels.length - 1]!;
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1];
      next.push(right === undefined ? left : merkleNodeHash(left, right));
    }
    levels.push(next);
  }
  return { root: levels[levels.length - 1]![0]!, size: leaves.length, levels };
}

export function merkleRoot(leaves: readonly string[]): string {
  return buildMerkleTree(leaves).root;
}

export function merkleInclusionProof(leaves: readonly string[], index: number): MerkleInclusionProof {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error(`merkle: index ${index} out of range for ${leaves.length} leaves`);
  }
  const tree = buildMerkleTree(leaves);
  const path: MerkleProofStep[] = [];
  let idx = index;

  for (let level = 0; level < tree.levels.length - 1; level++) {
    const nodes = tree.levels[level]!;
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = nodes[siblingIdx];
    // No sibling = promoted node: nothing to combine at this level.
    if (sibling !== undefined) {
      path.push({ hash: sibling, side: isRight ? "left" : "right" });
    }
    idx = Math.floor(idx / 2);
  }

  return { index, size: leaves.length, leafHash: tree.levels[0]![index]!, path };
}

export function verifyMerkleInclusion(proof: MerkleInclusionProof, root: string): boolean {
  if (proof.size <= 0) return false;
  if (proof.index < 0 || proof.index >= proof.size) return false;
  let hash = proof.leafHash;
  for (const step of proof.path) {
    hash = step.side === "left" ? merkleNodeHash(step.hash, hash) : merkleNodeHash(hash, step.hash);
  }
  return hash === root;
}

/** Convenience for verifiers that hold the raw leaf, not its hash. */
export function verifyLeafInclusion(leaf: string, proof: MerkleInclusionProof, root: string): boolean {
  return proof.leafHash === merkleLeafHash(leaf) && verifyMerkleInclusion(proof, root);
}
