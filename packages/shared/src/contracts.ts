import { z } from "zod";
import {
  CONSENT_TEMPLATE_DEFAULT,
  CONSENT_TEMPLATE_VERSIONS,
  SIGNATURE_MAX_BYTES,
  isActiveConsentTemplate,
  parseSignatureDataUrl,
} from "./phi.js";

/** Canonical API error shape (engineering-rules §3) — nothing else may leave the API. */
export const ErrorBody = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/** Kept for the offline sync client; the HTTP API reads refresh tokens from a cookie. */
export const RefreshRequest = z.object({
  refreshToken: z.string().min(20),
});

/** Server-owned identity — the client never assembles this itself (WEAKNESSES C3). */
export const SessionUser = z.object({
  id: z.string(),
  clinicId: z.string(),
  role: z.enum(["owner", "trichologist", "receptionist"]),
  email: z.string().email().optional(),
});

/** Internal service result: carries the refresh token that goes into the cookie. */
export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: SessionUser,
});

/**
 * What actually leaves the API on /auth/login and /auth/refresh. The refresh
 * token travels ONLY in an HttpOnly/Secure/SameSite cookie (WEAKNESSES H1), so
 * it is absent here by contract.
 */
export const AuthSession = z.object({
  accessToken: z.string(),
  user: SessionUser,
});

export const PatientCreate = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().regex(/^0\d{10}$/, "فرمت موبایل: 09xxxxxxxxx"),
  gender: z.enum(["male", "female"]).optional(),
  birthDate: z.string().date().optional(),
});

/**
 * Clinical notes travel on their own endpoint (phase 6 / C2). They are encrypted
 * before they touch the database, so they are deliberately NOT part of
 * PatientCreate — a note can never be written by accident as a side effect of
 * creating a row.
 */
export const PatientNotesUpdate = z.object({
  notes: z.string().max(8000).nullable(),
});
export type PatientNotesUpdate = z.infer<typeof PatientNotesUpdate>;
export type PatientNotesUpdateDto = PatientNotesUpdate;

export const PaginationQuery = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const SessionCreate = z.object({
  patientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
});

/**
 * §9.1 — plan = DB record. Since phase 2 the catalog is platform data written
 * only by the platform CLI/migration (WEAKNESSES C4, ADR-0031); this schema is
 * the shared wire contract for that surface.
 *
 * Limits are metered against bigint counters, so every value must be a
 * non-negative integer under a hard ceiling — no floats, no negatives, no
 * overflow. Price is bounded by the numeric(12,0) column behind it.
 */
export const PLAN_LIMIT_MAX = 1_000_000_000;
export const PLAN_PRICE_MAX = 999_999_999_999;

export const PlanLimits = z.record(
  z.string().min(1).max(60),
  z.number().int("مقدار سقف باید عدد صحیح باشد").min(0).max(PLAN_LIMIT_MAX),
);

export const PlanUpsert = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  name: z.record(z.string().min(1), z.string().min(1).max(120)),
  price: z.coerce.number().int().min(0).max(PLAN_PRICE_MAX),
  interval: z.enum(["month", "year"]).default("month"),
  features: z.array(z.string().min(1).max(60)).default([]),
  limits: PlanLimits.default({}),
});

/** Gallery upload init (phase 2 media pipeline). 50MB hard cap per DoD. */
export const GalleryInit = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.coerce.number().int().min(1024).max(52_428_800),
});

export const GalleryPageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(24),
  cursor: z.string().max(200).optional(),
});

/** Structured analysis output (§10) — heuristic baseline today, ONNX in phase 6. */
export const AnalysisScores = z.object({
  redness: z.number().min(0).max(100),
  flakeTexture: z.number().min(0).max(100),
  densityProxy: z.number().min(0).max(100),
});

export const AnalysisSubmit = z.object({
  patientId: z.string().uuid(),
  galleryItemId: z.string().uuid(),
  result: z.object({
    scores: AnalysisScores,
    severity: z.number().min(0).max(100),
    modelVersion: z.string().min(3).max(60),
  }),
});

/** Gold-label capture (§10.2) — the expert is the source of truth. */
export const ExpertReview = z.object({
  verdict: z.enum(["confirm", "adjust"]),
  adjustedScores: AnalysisScores.optional(),
  note: z.string().max(500).optional(),
});

/**
 * Consent (phase 6 / M8). Three things changed:
 *  - the signature must be a base64 data URL with an allowed MIME type and a
 *    bounded size — validated HERE, so an oversize blob is refused before it
 *    reaches a buffer;
 *  - `templateVersion` is a closed set, and a superseded version cannot be
 *    signed;
 *  - the wire field is still `signaturePayload`, but nothing persists it: the
 *    API writes the bytes to object storage and keeps a digest.
 */
export const SignatureDataUrl = z
  .string()
  .max(Math.ceil(SIGNATURE_MAX_BYTES * 1.4))
  .superRefine((value, ctx) => {
    try {
      parseSignatureDataUrl(value);
    } catch (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
    }
  });

export const ConsentCreate = z.object({
  patientId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  templateVersion: z
    .enum(CONSENT_TEMPLATE_VERSIONS as [string, ...string[]])
    .default(CONSENT_TEMPLATE_DEFAULT)
    .refine(isActiveConsentTemplate, "این نسخه از فرم رضایت‌نامه منقضی شده است"),
  signaturePayload: SignatureDataUrl,
});
export type ConsentCreate = z.infer<typeof ConsentCreate>;
export type ConsentCreateDto = ConsentCreate;

export const ConsentRevoke = z.object({
  reason: z.string().min(4).max(300),
});
export type ConsentRevokeDto = z.infer<typeof ConsentRevoke>;

/** §8 sync — one queued client mutation (payload shape is entity-specific). */
export const SyncMutation = z.object({
  clientMutationId: z.string().uuid(),
  entity: z.enum(["patients", "treatment_plans", "analyses"]),
  op: z.enum(["create", "update"]),
  schemaVersion: z.number().int(),
  clientUpdatedAt: z.string().datetime(),
  baseVersion: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const SyncPush = z.object({
  mutations: z.array(SyncMutation).min(1).max(100),
});

/** §8 — per-mutation result returned by POST /sync/push. */
export const SyncPushResultItem = z.object({
  clientMutationId: z.string().uuid(),
  status: z.enum(["applied", "duplicate", "rejected"]),
  reason: z.string().optional(),
});

/**
 * Retention & purge (phase 6 / M21). `scope` is explicit on purpose: "delete the
 * patient" is not a checkbox, it is a list of what will be destroyed.
 */
export const PURGE_SCOPE_VALUES = ["gallery", "analyses", "consents", "plans", "sessions", "ledger", "patient"] as const;

export const PurgeRequestCreate = z.object({
  patientId: z.string().uuid(),
  scope: z.array(z.enum(PURGE_SCOPE_VALUES)).min(1).max(PURGE_SCOPE_VALUES.length),
  reason: z.string().min(8).max(500),
});
export type PurgeRequestCreateDto = z.infer<typeof PurgeRequestCreate>;

export const PurgeDecision = z.object({
  reason: z.string().min(4).max(300).optional(),
});
export type PurgeDecisionDto = z.infer<typeof PurgeDecision>;

export const RetentionPolicyUpsert = z.object({
  entity: z.enum(["patient", "gallery", "analyses", "consents", "ledger"]),
  retainDays: z.coerce.number().int().min(0).max(36_500),
  graceDays: z.coerce.number().int().min(0).max(3_650).optional(),
});
export type RetentionPolicyUpsertDto = z.infer<typeof RetentionPolicyUpsert>;

export type LoginRequest = z.infer<typeof LoginRequest>;
export type RefreshRequest = z.infer<typeof RefreshRequest>;
export type SessionUser = z.infer<typeof SessionUser>;
export type TokenPair = z.infer<typeof TokenPair>;
export type AuthSession = z.infer<typeof AuthSession>;
export type PatientCreate = z.infer<typeof PatientCreate>;
export type PatientCreateDto = PatientCreate;
export type SessionCreate = z.infer<typeof SessionCreate>;
export type PlanLimits = z.infer<typeof PlanLimits>;
export type PlanUpsert = z.infer<typeof PlanUpsert>;
export type PlanUpsertDto = PlanUpsert;
export type GalleryInit = z.infer<typeof GalleryInit>;
export type GalleryInitDto = GalleryInit;
export type GalleryPageQuery = z.infer<typeof GalleryPageQuery>;
export type AnalysisScores = z.infer<typeof AnalysisScores>;
export type AnalysisSubmit = z.infer<typeof AnalysisSubmit>;
export type AnalysisSubmitDto = AnalysisSubmit;
export type ExpertReview = z.infer<typeof ExpertReview>;
export type ExpertReviewDto = ExpertReview;
export type SyncPush = z.infer<typeof SyncPush>;
export type SyncPushDto = SyncPush;
