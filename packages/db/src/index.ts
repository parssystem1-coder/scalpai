export * from "./schema.js";
export * from "./tenant.js";
export * from "./migrate.js";
export { loadEnv } from "./load-env.js";
export { seed } from "./seed.js";
export {
  appendAudit,
  verifyChain,
  listPatients,
  getPatientById,
  getPatientIncludingDeleted,
  createPatient,
  softDeletePatient,
  listSessions,
  createSession,
  createConsent,
  listConsentsForPatient,
  type PatientCreateInput,
  type CreateConsentInput,
} from "./repos/core.repo.js";
export * from "./repos/refresh.repo.js";
export {
  createPendingGalleryItem,
  getGalleryItem,
  completeGalleryItem,
  deletePendingGalleryItem,
  listGalleryByPatient,
  softDeleteGalleryItem,
} from "./repos/gallery.repo.js";
export {
  createAnalysis,
  getAnalysisById,
  listAnalysesByPatient,
  saveExpertReview,
} from "./repos/analyses.repo.js";
export {
  processPushBatch,
  pullSince,
} from "./repos/sync.repo.js";
export type { PushItemResult } from "@scalpai/sync-client";
export {
  findUserByEmail,
  touchLogin,
  resolveEntitlement,
  loginLookup,
  claimsById,
  listPlans,
  getPlanByCode,
  getPlanWithFeatures,
  upsertPlan,
  deletePlan,
  countEntitlementsByPlan,
  getUsage,
  incrementUsage,
  type ResolvedEntitlement,
  type PlanUpsertInput,
} from "./repos/users.repo.js";
/**
 * Platform-admin catalog operations (ADR-0031). They connect as the migration
 * role on purpose and are unreachable for tenant HTTP traffic — the conformance
 * rule `platform-boundaries` fails the build if a controller imports them.
 */
export {
  PLAN_LIMIT_MAX,
  PLAN_PRICE_MAX,
  listPlansAsPlatform,
  upsertPlanAsPlatform,
  deletePlanAsPlatform,
} from "./plans-admin.js";
/**
 * WEAKNESSES H18: destructive test helpers (resetAll, …) are NOT part of this
 * public surface. Import them from `@scalpai/db/testing` instead.
 */
