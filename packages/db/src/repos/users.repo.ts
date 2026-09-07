import { and, eq, isNull, sql } from "drizzle-orm";
import { entitlements, planFeatures, plans, users } from "../schema.js";
import { mergePlanLimits } from "./quota.repo.js";
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
    // NOT a spread: a metric can be written with more than one key, so an
    // override must retire the plan's sibling key instead of sitting next to it
    // (see mergePlanLimits — WEAKNESSES H11).
    limits: mergePlanLimits(
      plan.limits as Record<string, unknown> | null,
      ent.overrides as Record<string, unknown> | null,
    ),
  };
}

/** SECURITY DEFINER wrappers — the ONLY pre-auth doors into RLS'd tables. */
export async function loginLookup(tx: Tx, email: string) {
  const res = await tx.execute(sql`SELECT id, clinic_id, role::text AS role, password_hash FROM fn_auth_login(${email})`);
  const r = ((res as unknown) as { rows?: Array<{ id: string; clinic_id: string; role: string; password_hash: string }> }).rows?.[0];
  return r ?? null;
}

/**
 * Server-side identity for a user id (revoked users are filtered inside the
 * SQL function). Email is included so refresh responses can carry the whole
 * identity and the client never has to invent one (WEAKNESSES C3).
 */
export async function claimsById(tx: Tx, userId: string) {
  const res = await tx.execute(sql`SELECT id, clinic_id, role::text AS role, email FROM fn_user_claims(${userId})`);
  const r = ((res as unknown) as { rows?: Array<{ id: string; clinic_id: string; role: string; email: string }> }).rows?.[0];
  return r ?? null;
}

// ---------------- Plans catalog (§9.1 — plan = DB record, not code) ----------------

export async function listPlans(tx: Tx) {
  return tx.select().from(plans).orderBy(plans.price);
}

export async function getPlanByCode(tx: Tx, code: string) {
  const rows = await tx.select().from(plans).where(eq(plans.code, code)).limit(1);
  return rows[0] ?? null;
}

export async function getPlanWithFeatures(tx: Tx, code: string) {
  const plan = await getPlanByCode(tx, code);
  if (!plan) return null;
  const feats = await tx.select({ feature: planFeatures.feature }).from(planFeatures).where(eq(planFeatures.planCode, code));
  // sorted for a deterministic API contract
  return { ...plan, features: feats.map((f) => f.feature).sort() };
}

export interface PlanUpsertInput {
  code: string;
  name: unknown; // jsonb map fa/en/...
  price: string; // numeric(12,0) money as string
  interval: "month" | "year";
  features: string[];
  limits: Record<string, number>;
}

/** Upsert plan row + full replace of its feature set, atomically in the caller's tx. */
export async function upsertPlan(tx: Tx, input: PlanUpsertInput): Promise<void> {
  await tx
    .insert(plans)
    .values({
      code: input.code,
      name: input.name as object,
      price: input.price,
      interval: input.interval,
      limits: input.limits,
    })
    .onConflictDoUpdate({
      target: plans.code,
      set: { name: input.name as object, price: input.price, interval: input.interval, limits: input.limits },
    });
  await tx.delete(planFeatures).where(eq(planFeatures.planCode, input.code));
  if (input.features.length > 0) {
    await tx.insert(planFeatures).values(input.features.map((feature) => ({ planCode: input.code, feature })));
  }
}

export async function deletePlan(tx: Tx, code: string): Promise<boolean> {
  const rows = await tx.delete(plans).where(eq(plans.code, code)).returning({ code: plans.code });
  return rows.length > 0;
}

/** Deleting a plan that clinics still sit on would break entitlement resolution. */
export async function countEntitlementsByPlan(tx: Tx, code: string): Promise<number> {
  const rows = await tx.select({ clinicId: entitlements.clinicId }).from(entitlements).where(eq(entitlements.planCode, code));
  return rows.length;
}

/**
 * Metering does NOT live here any more (phase 8 / WEAKNESSES H11).
 *
 * `getUsage()` + `incrementUsage()` used to sit in this file. They computed the
 * period in fixed UTC and left check and increment as two statements, which is
 * exactly the race that let a clinic pass its own plan ceiling. They are gone —
 * not deprecated — so nothing can quietly keep using them. The single metering
 * surface is `repos/quota.repo.ts` (ADR-0041).
 */
