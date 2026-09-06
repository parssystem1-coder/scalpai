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
  setPatientNotes,
  readPatientNotes,
  rotatePatientNotes,
  patientNotesAad,
  listSessions,
  createSession,
  createConsent,
  revokeConsent,
  listConsentsForPatient,
  getConsentSignatureRef,
  consentSignatureKey,
  ConsentError,
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
/**
 * Phase 6 (ADR-0038) — PHI at rest, audit evidence, retention and object
 * reconciliation. `phi-crypto` is the ONLY encryption surface; nothing else may
 * write `patients.notes_encrypted`.
 */
export {
  PHI_ENVELOPE_VERSION,
  PHI_KEY_MAX_AGE_DAYS_DEFAULT,
  PhiCryptoError,
  assertEncryptedAtRest,
  decryptPhi,
  encryptPhi,
  generatePhiKey,
  loadPhiKeyRing,
  phiCiphertextKid,
  phiFingerprint,
  phiKeyRotationStatus,
  resetPhiKeyRingCache,
  rotatePhiCiphertext,
  type PhiAad,
  type PhiKeyRing,
} from "./phi-crypto.js";
export { canonicalAuditPayload, computeAuditRowHash, type AuditRowInput } from "./audit-hash.js";
export {
  ANCHOR_VERSION,
  AuditAnchorError,
  auditInclusionProof,
  buildAnchor,
  generateClinicAuditAnchor,
  readAnchorFile,
  signAnchor,
  verifyAnchorSignature,
  verifyAuditChain,
  verifyAuditChainIntegrity,
  verifyAuditInclusion,
  verifyStoredAnchor,
  writeAnchorToWorm,
  type AuditAnchor,
  type AuditChainRow,
  type AuditChainVerdict,
  type SignedAuditAnchor,
} from "./audit-anchor.js";
export {
  EMPTY_MERKLE_ROOT,
  buildMerkleTree,
  merkleInclusionProof,
  merkleLeafHash,
  merkleRoot,
  verifyLeafInclusion,
  verifyMerkleInclusion,
  type MerkleInclusionProof,
} from "./merkle.js";
export {
  CLINICAL_DISCLAIMER_FA,
  REPORT_SEAL_VERSION,
  ReportSealError,
  generateReportSealKeyPair,
  mayClaimAuthenticity,
  reportKeyId,
  resetSealKeyCache,
  sealReport,
  trySealReport,
  verifyReportSeal,
  type ReportSeal,
  type ReportSealSubject,
} from "./report-seal.js";
export {
  ORPHAN_MAX_ATTEMPTS,
  claimStorageOrphans,
  countOpenOrphans,
  enqueueStorageOrphans,
  listOrphansByIds,
  markStorageOrphanDeleted,
  markStorageOrphanFailed,
  reconcileStorage,
  type OrphanRow,
  type OrphanState,
  type ReconcileReport,
} from "./repos/storage-orphans.repo.js";
export {
  PURGE_GRACE_DAYS_DEFAULT,
  PURGE_SCOPES,
  RETENTION_DEFAULTS,
  RetentionError,
  approvePurge,
  assertPurgeScope,
  executePurge,
  listPurgeRequests,
  rejectPurge,
  requestPurge,
  resolveGraceDays,
  upsertRetentionPolicy,
  type PurgeEvidence,
  type PurgeScope,
} from "./repos/retention.repo.js";
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
