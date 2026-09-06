import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  EMPTY_MERKLE_ROOT,
  buildMerkleTree,
  merkleInclusionProof,
  merkleLeafHash,
  merkleRoot,
  verifyLeafInclusion,
  verifyMerkleInclusion,
} from "./merkle.js";

const leaf = (n: number): string => createHash("sha256").update(`row-${n}`).digest("hex");

describe("Merkle tree (H17)", () => {
  it("has a defined empty root and a single-leaf root", () => {
    expect(merkleRoot([])).toBe(EMPTY_MERKLE_ROOT);
    expect(merkleRoot([leaf(1)])).toBe(merkleLeafHash(leaf(1)));
  });

  it("issues a verifiable inclusion proof for every leaf, odd sizes included", () => {
    for (const size of [1, 2, 3, 5, 8, 13]) {
      const leaves = Array.from({ length: size }, (_, i) => leaf(i));
      const root = merkleRoot(leaves);
      for (let i = 0; i < size; i++) {
        const proof = merkleInclusionProof(leaves, i);
        expect(verifyMerkleInclusion(proof, root)).toBe(true);
        expect(verifyLeafInclusion(leaves[i]!, proof, root)).toBe(true);
      }
    }
  });

  it("rejects a proof against the wrong root or a swapped leaf", () => {
    const leaves = Array.from({ length: 6 }, (_, i) => leaf(i));
    const root = merkleRoot(leaves);
    const proof = merkleInclusionProof(leaves, 2);

    expect(verifyMerkleInclusion(proof, merkleRoot([...leaves, leaf(99)]))).toBe(false);
    expect(verifyLeafInclusion(leaf(99), proof, root)).toBe(false);
    expect(verifyMerkleInclusion({ ...proof, path: [] }, root)).toBe(false);
  });

  it("changes the root when any leaf changes", () => {
    const leaves = Array.from({ length: 7 }, (_, i) => leaf(i));
    const tampered = [...leaves];
    tampered[4] = leaf(404);
    expect(merkleRoot(tampered)).not.toBe(merkleRoot(leaves));
  });

  it("does not let a promoted odd node collide with a duplicated one (CVE-2012-2459)", () => {
    const leaves = [leaf(1), leaf(2), leaf(3)];
    const duplicatedTail = [leaf(1), leaf(2), leaf(3), leaf(3)];
    expect(merkleRoot(leaves)).not.toBe(merkleRoot(duplicatedTail));
  });

  it("exposes levels that end in the root", () => {
    const tree = buildMerkleTree(Array.from({ length: 5 }, (_, i) => leaf(i)));
    expect(tree.size).toBe(5);
    expect(tree.levels[0]).toHaveLength(5);
    expect(tree.levels[tree.levels.length - 1]).toEqual([tree.root]);
  });

  it("refuses an out-of-range index", () => {
    expect(() => merkleInclusionProof([leaf(1)], 3)).toThrow(/out of range/);
  });
});
