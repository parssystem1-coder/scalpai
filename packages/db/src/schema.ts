import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, date, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Mirror of the hand-written SQL migrations (ADR-0002). */

export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),
  status: text("status").notNull().default("active"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  branchId: uuid("branch_id"),
  role: text("role").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  clinicId: uuid("clinic_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  familyId: uuid("family_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  replacedBy: uuid("replaced_by"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("refresh_tokens_hash_uq").on(t.tokenHash)]);

/**
 * `notesEncrypted` is an AES-256-GCM envelope (`phi.v1.<kid>.…`) since phase 6 —
 * a CHECK constraint in 0012 refuses anything else, and `notesKeyId` records
 * which key wrapped it so rotation knows what to re-wrap (WEAKNESSES C2).
 */
export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  gender: text("gender"),
  birthDate: date("birth_date"),
  notesEncrypted: text("notes_encrypted"),
  notesKeyId: text("notes_key_id"),
  notesUpdatedAt: timestamp("notes_updated_at", { withTimezone: true }),
  tags: text("tags").array().default([]),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("patients_clinic_phone_live_uq").on(t.clinicId, t.phone).where(sql`deleted_at IS NULL`),
]);

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  name: text("name").notNull(),
  durationMin: integer("duration_min").notNull().default(30),
  bufferAfterMin: integer("buffer_after_min").notNull().default(0),
  price: numeric("price", { precision: 12, scale: 0 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  staffId: uuid("staff_id"),
  serviceId: uuid("service_id"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  status: text("status").notNull().default("booked"),
  source: text("source").notNull().default("staff"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const galleryItems = pgTable("gallery_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  sessionId: uuid("session_id"),
  storageKey: text("storage_key").notNull(),
  thumbKey: text("thumb_key"),
  mime: text("mime").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  bodyRegion: text("body_region"),
  exifStripped: boolean("exif_stripped").notNull().default(false),
  uploadState: text("upload_state").notNull().default("pending"),
  quality: jsonb("quality"),
  sha256: text("sha256"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const analyses = pgTable("analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  sessionId: uuid("session_id"),
  galleryItemId: uuid("gallery_item_id"),
  type: text("type").notNull(),
  result: jsonb("result").notNull(),
  expertReview: jsonb("expert_review"),
  modelVersion: text("model_version"),
  explainMapKey: text("explain_map_key"),
  confidenceAvg: numeric("confidence_avg", { precision: 5, scale: 4 }),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Phase 6 (M8): the signature itself lives in the object store. The row keeps a
 * key, a digest, its size/MIME and the request context that produced it — enough
 * to prove authenticity, small enough that a consent list is not a 5MB download.
 */
export const consents = pgTable("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  serviceId: uuid("service_id"),
  templateVersion: text("template_version").notNull(),
  signatureKey: text("signature_key"),
  signatureSha256: text("signature_sha256"),
  signatureBytes: integer("signature_bytes"),
  signatureMime: text("signature_mime"),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  signedFromIp: text("signed_from_ip"),
  signedUserAgent: text("signed_user_agent"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by"),
  revokedReason: text("revoked_reason"),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  clinicId: uuid("clinic_id"),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  meta: jsonb("meta"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  prevHash: text("prev_hash"),
  rowHash: text("row_hash").notNull(),
});

/** Signed Merkle roots over the audit chain (H17). Insert-only at the RLS level. */
export const auditAnchors = pgTable("audit_anchors", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  treeSize: integer("tree_size").notNull(),
  firstLogId: bigint("first_log_id", { mode: "number" }).notNull(),
  lastLogId: bigint("last_log_id", { mode: "number" }).notNull(),
  lastRowHash: text("last_row_hash").notNull(),
  merkleRoot: text("merkle_root").notNull(),
  keyId: text("key_id"),
  signature: text("signature"),
  wormUri: text("worm_uri"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Objects whose row is gone — a failed delete is queued, never swallowed (M22). */
export const storageOrphans = pgTable("storage_orphans", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  storageKey: text("storage_key").notNull(),
  reason: text("reason").notNull(),
  state: text("state").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Per-clinic retention windows (M21). */
export const retentionPolicies = pgTable("retention_policies", {
  clinicId: uuid("clinic_id").notNull(),
  entity: text("entity").notNull(),
  retainDays: integer("retain_days").notNull(),
  graceDays: integer("grace_days").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.clinicId, t.entity] })]);

/** Patient purge with two-person approval and a grace window (M21). */
export const purgeRequests = pgTable("purge_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  scope: text("scope").array().notNull(),
  reason: text("reason").notNull(),
  state: text("state").notNull().default("requested"),
  requestedBy: uuid("requested_by").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  executableAt: timestamp("executable_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  evidence: jsonb("evidence"),
});

export const plans = pgTable("plans", {
  code: text("code").primaryKey(),
  name: jsonb("name").notNull(),
  price: numeric("price", { precision: 12, scale: 0 }).notNull().default("0"),
  interval: text("interval").notNull().default("month"),
  limits: jsonb("limits").notNull().default({}),
});

export const planFeatures = pgTable("plan_features", {
  planCode: text("plan_code").notNull(),
  feature: text("feature").notNull(),
}, (t) => [primaryKey({ columns: [t.planCode, t.feature] })]);

export const entitlements = pgTable("entitlements", {
  clinicId: uuid("clinic_id").primaryKey(),
  planCode: text("plan_code").notNull(),
  overrides: jsonb("overrides"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
});

export const usageCounters = pgTable("usage_counters", {
  clinicId: uuid("clinic_id").notNull(),
  metric: text("metric").notNull(),
  periodStart: date("period_start").notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.clinicId, t.metric, t.periodStart] })]);

/**
 * Sync ledger. Phase 6 (H3): `payload` is the REDACTED delta — field names and
 * ciphertext only. A CHECK constraint in 0012 rejects readable PHI keys, so a
 * future code path cannot quietly start broadcasting notes again.
 */
export const mutations = pgTable("mutations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  clinicId: uuid("clinic_id").notNull(),
  userId: uuid("user_id"),
  clientMutationId: uuid("client_mutation_id").notNull(),
  entity: text("entity").notNull(),
  op: text("op").notNull(),
  payload: jsonb("payload").notNull(),
  serverSeq: bigserial("server_seq", { mode: "number" }).notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const treatmentPlans = pgTable("treatment_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  items: jsonb("items").notNull().default([]),
  startDate: date("start_date"),
  reviewIntervals: jsonb("review_intervals"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
