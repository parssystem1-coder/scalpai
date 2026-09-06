import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenant.js";
import { sha256 } from "../tenant.js";

const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;

/**
 * Refresh-token store (WEAKNESSES C5/R5 — ADR-0029).
 *
 * `refresh_tokens` sits behind FORCE RLS and the application role has NO direct
 * privilege on the table at all. Every access goes through SECURITY DEFINER
 * functions owned by the dedicated `scalpai_auth` role, so the pre-tenant auth
 * flow never needs a wide-open service role, and a tenant-scoped connection can
 * still only ever see its own clinic's rows (policy + explicit clinic_id).
 */

interface RawRefreshRow {
  id: string;
  user_id: string;
  clinic_id: string;
  family_id: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  replaced_by: string | null;
}

export interface RefreshTokenRow {
  id: string;
  userId: string;
  clinicId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

function mapRow(row: RawRefreshRow): RefreshTokenRow {
  return {
    id: row.id,
    userId: row.user_id,
    clinicId: row.clinic_id,
    familyId: row.family_id,
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    replacedBy: row.replaced_by,
  };
}

function rowsOf<T>(res: unknown): T[] {
  return ((res as { rows?: T[] }).rows ?? []) as T[];
}

export async function findByHash(tx: Tx, presented: string): Promise<RefreshTokenRow | null> {
  const res = await tx.execute(
    sql`SELECT id, user_id, clinic_id, family_id, expires_at, revoked_at, replaced_by FROM fn_refresh_find(${sha256(presented)})`,
  );
  const row = rowsOf<RawRefreshRow>(res)[0];
  return row ? mapRow(row) : null;
}

export async function findLiveByHash(tx: Tx, presented: string): Promise<RefreshTokenRow | null> {
  const row = await findByHash(tx, presented);
  return row && row.revokedAt === null ? row : null;
}

export async function revokeFamily(tx: Tx, familyId: string): Promise<void> {
  await tx.execute(sql`SELECT fn_refresh_revoke_family(${familyId}::uuid)`);
}

/** Mint a brand-new family (login) or extend an existing one (rotation). */
export async function issueRefresh(
  tx: Tx,
  p: { userId: string; clinicId: string; familyId?: string },
): Promise<{ id: string; familyId: string; token: string }> {
  const token = `${randomUUID()}.${randomUUID()}`;
  const id = randomUUID();
  const familyId = p.familyId ?? randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  await tx.execute(
    sql`SELECT fn_refresh_issue(${id}::uuid, ${p.userId}::uuid, ${p.clinicId}::uuid, ${sha256(token)}, ${familyId}::uuid, ${expiresAt}::timestamptz)`,
  );
  return { id, familyId, token };
}

/** Insert the rotated child token; returns its id (stored as replacedBy on the parent). */
export async function insertChild(
  tx: Tx,
  p: { userId: string; clinicId: string; familyId: string },
): Promise<{ childId: string; token: string }> {
  const issued = await issueRefresh(tx, p);
  return { childId: issued.id, token: issued.token };
}

export async function markReplaced(tx: Tx, parentId: string, childId: string): Promise<void> {
  await tx.execute(sql`SELECT fn_refresh_mark_replaced(${parentId}::uuid, ${childId}::uuid)`);
}

export { REFRESH_TTL_MS };
