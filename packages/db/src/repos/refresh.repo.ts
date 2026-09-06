import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refreshTokens } from "../schema.js";
import type { Tx } from "../tenant.js";
import { sha256 } from "../tenant.js";

const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;

export async function findLiveByHash(tx: Tx, presented: string) {
  const rows = await tx
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, sha256(presented)), isNull(refreshTokens.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findByHash(tx: Tx, presented: string) {
  const rows = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(presented))).limit(1);
  return rows[0] ?? null;
}

export async function revokeFamily(tx: Tx, familyId: string): Promise<void> {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/** Insert the rotated child token; returns its id (stored as replacedBy on the parent). */
export async function insertChild(
  tx: Tx,
  p: { userId: string; familyId: string },
): Promise<{ childId: string; token: string }> {
  const token = `${randomUUID()}.${randomUUID()}`;
  const childId = randomUUID();
  await tx.insert(refreshTokens).values({
    id: childId,
    userId: p.userId,
    tokenHash: sha256(token),
    familyId: p.familyId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { childId, token };
}

export async function markReplaced(tx: Tx, parentId: string, childId: string): Promise<void> {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedBy: childId })
    .where(eq(refreshTokens.id, parentId));
}

export { REFRESH_TTL_MS };
