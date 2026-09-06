import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenant.js";
import { sha256 } from "../tenant.js";

const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;

/**
 * Refresh-token store (WEAKNESSES C5/R5 — ADR-0029, R4 — ADR-0033).
 *
 * `refresh_tokens` sits behind FORCE RLS and the application role has NO direct
 * privilege on the table at all. Every access goes through SECURITY DEFINER
 * functions owned by the dedicated `scalpai_auth` role, so the pre-tenant auth
 * flow never needs a wide-open service role, and a tenant-scoped connection can
 * still only ever see its own clinic's rows (policy + explicit clinic_id).
 *
 * Phase 3: rotation is ONE call. `fn_refresh_rotate` locks the parent row,
 * decides the outcome and writes the child + the replacement marker inside a
 * single transaction — there is no window left where two concurrent refreshes
 * can both win.
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

export async function revokeFamily(tx: Tx, familyId: string): Promise<void> {
  await tx.execute(sql`SELECT fn_refresh_revoke_family(${familyId}::uuid)`);
}

/** Logout: kill the whole family of the presented token in one round trip. */
export async function revokeByToken(tx: Tx, presented: string): Promise<string | null> {
  const res = await tx.execute(
    sql`SELECT fn_refresh_revoke_by_token(${sha256(presented)}) AS family_id`,
  );
  const row = rowsOf<{ family_id: string | null }>(res)[0];
  return row?.family_id ?? null;
}

/** Mint a brand-new family (login). */
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

/** Every way a rotation attempt can end — decided by the database, not the API. */
export type RotateOutcome =
  | "rotated"
  | "reused"
  | "expired"
  | "revoked_user"
  | "clinic_mismatch"
  | "unknown";

export interface RotatedSession {
  outcome: RotateOutcome;
  familyId: string | null;
  /** Only present for `rotated` — the freshly minted child token. */
  refreshToken: string | null;
  /** Server-side identity, always read from `users` (R5). */
  user: { id: string; clinicId: string; role: string; email: string } | null;
}

interface RawRotateRow {
  outcome: string;
  child_id: string | null;
  subject_id: string | null;
  subject_clinic_id: string | null;
  subject_role: string | null;
  subject_email: string | null;
  token_family_id: string | null;
}

/**
 * Atomic rotation (R4). The parent row is locked with `FOR UPDATE`, so the
 * second of two concurrent refreshes re-reads the row only after the first has
 * committed and therefore always lands on `reused` — which revokes the whole
 * family in the same transaction.
 */
export async function rotateRefresh(tx: Tx, presented: string): Promise<RotatedSession> {
  const childId = randomUUID();
  const childToken = `${randomUUID()}.${randomUUID()}`;
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();

  const res = await tx.execute(
    sql`SELECT outcome, child_id, subject_id, subject_clinic_id, subject_role, subject_email, token_family_id
        FROM fn_refresh_rotate(${sha256(presented)}, ${childId}::uuid, ${sha256(childToken)}, ${expiresAt}::timestamptz)`,
  );
  const row = rowsOf<RawRotateRow>(res)[0];
  if (!row) return { outcome: "unknown", familyId: null, refreshToken: null, user: null };

  const outcome = row.outcome as RotateOutcome;
  if (outcome !== "rotated" || !row.subject_id || !row.subject_clinic_id || !row.subject_role) {
    return { outcome, familyId: row.token_family_id, refreshToken: null, user: null };
  }

  return {
    outcome,
    familyId: row.token_family_id,
    refreshToken: childToken,
    user: {
      id: row.subject_id,
      clinicId: row.subject_clinic_id,
      role: row.subject_role,
      email: row.subject_email ?? "",
    },
  };
}

export { REFRESH_TTL_MS };
