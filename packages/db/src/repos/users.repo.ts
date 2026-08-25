import { and, eq, isNull, sql } from "drizzle-orm";
import { entitlements, planFeatures, plans, users } from "../schema.js";
import type { Tx } from "../tenant.js";

export async function findUserByEmail(tx: Tx, email: string) {
  const rows = await tx
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchLogin(tx: Tx, userId: string): Promise<void> {
  await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export interface ResolvedEntitlement {
  plan: string;
  features: string[];
  limits: Record<string, unknown>;
}

/** Single source of truth for what a clinic may do (§9.1). Cached at service layer. */
export async function resolveEntitlement(tx: Tx, clinicId: string): Promise<ResolvedEntitlement | null> {
  const ent = (
    await tx
      .select({ planCode: entitlements.planCode, overrides: entitlements.overrides })
      .from(entitlements)
      .where(eq(entitlements.clinicId, clinicId))
      .limit(1)
  )[0];
  if (!ent) return null;
  const plan = (await tx.select().from(plans).where(eq(plans.code, ent.planCode)).limit(1))[0];
  if (!plan) return null;
  const feats = await tx.select({ feature: planFeatures.feature }).from(planFeatures).where(eq(planFeatures.planCode, ent.planCode));
  return {
    plan: ent.planCode,
    features: feats.map((f) => f.feature),
    limits: { ...(plan.limits as object), ...((ent.overrides as object) ?? {}) },
  };
}

/** SECURITY DEFINER wrappers — the ONLY pre-auth doors into RLS'd tables. */
export async function loginLookup(tx: Tx, email: string) {
  const res = await tx.execute(sql`SELECT id, clinic_id, role::text AS role, password_hash FROM fn_auth_login(${email})`);
  const r = ((res as unknown) as { rows?: Array<{ id: string; clinic_id: string; role: string; password_hash: string }> }).rows?.[0];
  return r ?? null;
}

export async function claimsById(tx: Tx, userId: string) {
  const res = await tx.execute(sql`SELECT id, clinic_id, role::text AS role FROM fn_user_claims(${userId})`);
  const r = ((res as unknown) as { rows?: Array<{ id: string; clinic_id: string; role: string }> }).rows?.[0];
  return r ?? null;
}
