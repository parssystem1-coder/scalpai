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
/**
 * Phase 7 (ADR-0039) — offline correctness. `pullMutations` is cursor-based and
 * commit-safe (H5); `processPushBatch` isolates every item in its own savepoint
 * and records only applied deltas in the ledger (H3/H4).
 */
export {
  PULL_LIMIT_MAX,
  SyncCursorError,
  processPushBatch,
  pullMutations,
  type SyncPullItem,
  type SyncPullPage,
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
/**
 * Phase 8 (ADR-0041) — metering. This is the ONLY door to usage counters and
 * storage totals: the previous `getUsage`/`incrementUsage` pair computed its
 * period in UTC and left check and increment as two racing statements (H11).
 */
export {
  QUOTA_SPECS,
  QuotaError,
  addStorageBytes,
  clinicPeriodStart,
  consumeQuota,
  getStorageUsage,
  isQuotaName,
  peekQuota,
  quotaMetric,
  releaseQuota,
  reserveStorageBytes,
  resolveQuotaLimit,
  setStorageUsage,
  type QuotaName,
  type QuotaSpec,
  type QuotaVerdict,
  type StorageReservation,
  type StorageUsageRow,
} from "./repos/quota.repo.js";
/**
 * Phase 8 (ADR-0041) — resumable uploads. The session row is the server-side
 * truth for `uploadId`/part geometry, so a resume continues the SAME multipart
 * upload instead of restarting it from part 1 (H7).
 */
export {
  UPLOAD_SESSION_TTL_MS,
  abortUploadSession,
  attachUploadId,
  completeUploadSession,
  createUploadSession,
  expireUploadSessions,
  findOpenUploadSession,
  getUploadSession,
  type CreateUploadSessionInput,
  type UploadSessionRow,
  type UploadSessionState,
} from "./repos/upload-sessions.repo.js";
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
 * Phase 5a (ADR-0046) — metering for the counters this phase introduced.
 * Separate from `quota.repo` on purpose: those metrics are a GATE in front of a
 * request, these are a COUNT after the fact (100MB already uploaded cannot be
 * taken back, only counted). Both go through `fn_usage_consume`, so check and
 * increment stay one locked statement.
 */
export {
  METERING_SPECS,
  MeteringError,
  bytesToMeteredMb,
  isMeteredMetricName,
  meterUsage,
  peekUsage,
  releaseUsage,
  resolveMeteredLimit,
  type MeterVerdict,
  type MeteredMetricName,
  type MeteredSpec,
} from "./repos/metering.repo.js";
/**
 * Phase 5a (ADR-0046) — aftercare engine. `claimDueEnrollments` is the only way
 * to pick up due work: it goes through `fn_aftercare_claim_due` (FOR UPDATE SKIP
 * LOCKED), because a read-then-update pair lets two workers claim the same row
 * and the patient gets the same message twice.
 */
export {
  AFTERCARE_CLAIM_LIMIT_MAX,
  AFTERCARE_MAX_ATTEMPTS,
  AftercareError,
  advanceEnrollment,
  claimDueEnrollments,
  createEnrollment,
  createSequence,
  deferEnrollment,
  getEnrollment,
  getSequence,
  listEnrollments,
  listSequences,
  setEnrollmentState,
  softDeleteSequence,
  stepRunAt,
  updateSequence,
  type AftercareStepRow,
  type ClaimedEnrollment,
  type EnrollmentAction,
  type EnrollmentCreateInput,
  type EnrollmentFilter,
  type EnrollmentRow,
  type SequenceCreateInput,
  type SequencePatch,
  type SequenceRow,
} from "./repos/aftercare.repo.js";
/**
 * Phase 5a (ADR-0046) — the scheduler's ONE cross-tenant read. Backed by the
 * SECURITY DEFINER `fn_aftercare_due_clinics` (0018), which returns clinic
 * identity only. Everything the worker does afterwards runs inside a normal
 * per-clinic RLS transaction.
 */
export {
  DUE_CLINIC_LIMIT_MAX,
  listDueClinics,
  type DueClinic,
} from "./repos/aftercare-scheduler.repo.js";
/**
 * Phase 5a (ADR-0046) — messaging gateway. No phone number and no outbound body
 * ever reaches a column: `recipientDigest` is called before every insert, and an
 * inbound body is stored only as a `phi.v1` envelope bound to its own row.
 */
export {
  MessagingError,
  bodyDigest,
  enqueueMessage,
  isOptedOut,
  listInbox,
  listMessages,
  markMessageDelivered,
  markMessageFailed,
  markMessageSent,
  markMessageSuppressed,
  readInboundBody,
  recipientDigest,
  recordInbound,
  setInboundState,
  type EnqueuedMessage,
  type InboundRecordInput,
  type InboxFilter,
  type MessageEnqueueInput,
  type MessageLogFilter,
  type RecordedInbound,
} from "./repos/messaging.repo.js";
/**
 * Phase 5a (ADR-0046) — billing. The repo never computes money: numbers come
 * from `fn_invoice_next_number` and totals from `fn_invoice_recalc`, so the
 * printed total and the sum of the lines cannot drift apart.
 */
export {
  BillingError,
  createInvoice,
  createProduct,
  getInvoice,
  getProduct,
  issueInvoice,
  listInvoices,
  listProducts,
  payInvoice,
  replaceInvoiceItems,
  softDeleteInvoice,
  softDeleteProduct,
  updateProduct,
  voidInvoice,
  type InvoiceCreateRecord,
  type InvoiceFilter,
  type InvoiceItemRecord,
  type PaymentRecord,
  type ProductCreateRecord,
  type ProductFilter,
  type ProductPatch,
} from "./repos/billing.repo.js";
/**
 * WEAKNESSES H18: destructive test helpers (resetAll, …) are NOT part of this
 * public surface. Import them from `@scalpai/db/testing` instead.
 */
