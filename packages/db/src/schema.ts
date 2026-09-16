import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, customType, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Mirror of the hand-written SQL migrations (ADR-0002). */

/**
 * PostgreSQL `xid8` — the 64-bit transaction id behind the commit-safe sync
 * cursor (phase 7 / H5). The driver returns it as digits, so it is carried as a
 * string: a JS number cannot hold a 64-bit counter.
 */
const xid8 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "xid8";
  },
});

/**
 * `timezone` is the clinic's IANA zone (phase 8 / H11). Quota periods are
 * computed from it in `fn_clinic_period_start`, because a fixed-UTC month opens
 * and closes a clinic budget on the wrong day. A guard trigger refuses a zone
 * PostgreSQL itself does not recognise.
 */
export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),
  status: text("status").notNull().default("active"),
  timezone: text("timezone").notNull().default("Asia/Tehran"),
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
 *
 * Phase 7 (H6): `rowVersion` / `fieldVersions` are maintained by the
 * `fn_bump_row_version` trigger and are the ONLY ordering input for sync
 * conflict resolution. Never write them from application code.
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
  rowVersion: integer("row_version").notNull().default(1),
  fieldVersions: jsonb("field_versions").notNull().default({}),
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

/**
 * Phase 8 (H12/M22): `sizeBytes` is the size of the object the pipeline actually
 * kept. The wire contract always carried a size, but nothing stored it, so no
 * honest storage total could be computed from the rows.
 */
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
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * Phase 8 (H7): the SERVER side of a resumable multipart upload. The browser
 * keeps a pointer to `id`; `uploadId`, `partSizeBytes` and `totalParts` live
 * here, which is what makes a resume continue the same S3 upload instead of
 * restarting it from part 1.
 */
export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  galleryItemId: uuid("gallery_item_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  partSizeBytes: integer("part_size_bytes").notNull(),
  totalParts: integer("total_parts").notNull(),
  uploadId: text("upload_id"),
  state: text("state").notNull().default("open"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/** Measured bucket occupancy per clinic (phase 8 / M22). */
export const storageUsage = pgTable("storage_usage", {
  clinicId: uuid("clinic_id").primaryKey(),
  objectCount: bigint("object_count", { mode: "number" }).notNull().default(0),
  bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
  source: text("source").notNull().default("delta"),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
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
 *
 * Phase 7:
 *  - H3: only APPLIED mutations are recorded, and the payload is the delta the
 *    server actually wrote (a rejected push is not broadcast to peers).
 *  - H4: idempotency is scoped to the clinic — `(clinic_id, client_mutation_id)`.
 *  - H5: `commitXid` is the writing transaction id, which makes the pull cursor
 *    commit-safe instead of trusting a pre-commit sequence.
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
  commitXid: xid8("commit_xid").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mutations_clinic_client_id_uq").on(t.clinicId, t.clientMutationId)]);

export const treatmentPlans = pgTable("treatment_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  items: jsonb("items").notNull().default([]),
  startDate: date("start_date"),
  reviewIntervals: jsonb("review_intervals"),
  rowVersion: integer("row_version").notNull().default(1),
  fieldVersions: jsonb("field_versions").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/* ══════════════════════════════════════════════════════════════════════════
 * Phase 5a — aftercare engine, messaging gateway, billing (0017 / ADR-0046)
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * A follow-up TEMPLATE. `steps` is a bounded jsonb array of
 * `{ offsetHours, channel, templateKey }`, shape-checked by a CHECK in 0017 so
 * jsonb does not mean "anything goes".
 *
 * It is one unit of editing (staff build the whole sequence and move the whole
 * sequence), which is why the steps are not a child table.
 */
export const aftercareSequences = pgTable("aftercare_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  /** manual | session_completed | analysis_created | invoice_paid */
  trigger: text("trigger").notNull().default("manual"),
  serviceId: uuid("service_id"),
  locale: text("locale").notNull().default("fa"),
  steps: jsonb("steps").notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  // Partial, like patients: a soft-deleted sequence must not hold its name forever.
  uniqueIndex("aftercare_sequences_clinic_name_live_uq")
    .on(t.clinicId, sql`lower(btrim(${t.name}))`)
    .where(sql`deleted_at IS NULL`),
]);

/**
 * One patient inside one sequence.
 *
 * `stepsSnapshot` freezes the plan at enrollment time — editing a sequence must
 * not move the schedule of a patient already inside it. `nextRunAt` is the ONLY
 * queue input: the worker claims by that column and never recomputes a due time
 * from its own clock, which is what stops a redeploy from resending day 3 to
 * everybody.
 */
export const aftercareEnrollments = pgTable("aftercare_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  sequenceId: uuid("sequence_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  sessionId: uuid("session_id"),
  /** active | paused | completed | cancelled */
  state: text("state").notNull().default("active"),
  currentStep: integer("current_step").notNull().default(0),
  stepsSnapshot: jsonb("steps_snapshot").notNull().default([]),
  locale: text("locale").notNull().default("fa"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  enrolledBy: uuid("enrolled_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Re-enrolling after completion is fine; being active twice is a double send.
  uniqueIndex("aftercare_enrollments_active_uq")
    .on(t.clinicId, t.sequenceId, t.patientId)
    .where(sql`state = 'active'`),
]);

/**
 * Outbound ledger. There is NO phone column and NO body column, on purpose:
 *
 *  - `recipientHash` is sha256 of the phone. Enough for dedup, per-recipient
 *    rate limiting and "did we contact this person", useless as a contact export.
 *  - `bodySha256` + `bodyChars` prove what was sent without keeping it. The text
 *    is `templateKey` + variables, and the variables ARE the PHI.
 *  - `varsRedacted` passes through `redactPhiPayload`, and a CHECK in 0017
 *    refuses the known PHI key names outright — the same guard 0012 put on
 *    `mutations.payload`.
 *  - `idempotencyKey` is unique per clinic. Without it a network retry sends the
 *    patient the same message twice.
 */
export const messageLog = pgTable("message_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  enrollmentId: uuid("enrollment_id"),
  patientId: uuid("patient_id"),
  stepIndex: integer("step_index"),
  /** kavenegar | bale | eitaa | telegram | whatsapp */
  channel: text("channel").notNull(),
  templateKey: text("template_key").notNull(),
  locale: text("locale").notNull().default("fa"),
  recipientHash: text("recipient_hash").notNull(),
  bodySha256: text("body_sha256").notNull(),
  bodyChars: integer("body_chars").notNull(),
  varsRedacted: jsonb("vars_redacted").notNull().default({}),
  /** queued | sent | delivered | failed | suppressed */
  state: text("state").notNull().default("queued"),
  provider: text("provider"),
  providerMessageId: text("provider_message_id"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  idempotencyKey: text("idempotency_key").notNull(),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("message_log_idempotency_uq").on(t.clinicId, t.idempotencyKey),
]);

/**
 * Patient replies. Unlike an outbound message the body cannot be regenerated and
 * an inbox without it is useless, so it IS stored — as a `phi.v1.` AES-256-GCM
 * envelope bound to this row by AAD, exactly like `patients.notesEncrypted`, with
 * a CHECK in 0017 refusing anything that is not an envelope.
 *
 * `bodyPreview` is the scrubbed projection (`scrubText`) the list view reads:
 * no emails, no phone numbers, bounded length.
 */
export const inboundMessages = pgTable("inbound_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  channel: text("channel").notNull(),
  provider: text("provider"),
  providerMessageId: text("provider_message_id"),
  senderHash: text("sender_hash").notNull(),
  patientId: uuid("patient_id"),
  enrollmentId: uuid("enrollment_id"),
  replyToMessageId: uuid("reply_to_message_id"),
  bodyEncrypted: text("body_encrypted"),
  bodyKeyId: text("body_key_id"),
  bodySha256: text("body_sha256"),
  bodyPreview: text("body_preview"),
  /** new | read | replied | archived */
  state: text("state").notNull().default("new"),
  /** unknown | question | reschedule | stop | confirm */
  intent: text("intent"),
  handledBy: uuid("handled_by"),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // A webhook that is delivered twice must not become two inbox rows.
  uniqueIndex("inbound_messages_provider_uq")
    .on(t.clinicId, t.channel, t.providerMessageId)
    .where(sql`provider_message_id IS NOT NULL`),
]);

/**
 * Sellable catalog. Money is `numeric(12,0)` like `services.price` and
 * `plans.price`: rial has no fraction, and a float total drifts by a rial per
 * line until the printed invoice and the sum of its rows disagree.
 *
 * Soft-deleted, and the sku uniqueness is PARTIAL — a full unique index lets one
 * deleted row hold its sku hostage forever.
 */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  /** goods | service | package */
  kind: text("kind").notNull().default("goods"),
  serviceId: uuid("service_id"),
  unit: text("unit").notNull().default("unit"),
  price: numeric("price", { precision: 12, scale: 0 }).notNull().default("0"),
  currency: text("currency").notNull().default("IRR"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("products_clinic_sku_live_uq")
    .on(t.clinicId, sql`upper(${t.sku})`)
    .where(sql`deleted_at IS NULL`),
]);

/**
 * Soft-deleted invoice.
 *
 * `subtotal` / `discount` / `tax` / `total` are STORED but never written by
 * application code: `fn_invoice_recalc` derives them from the live items, and it
 * refuses to touch a paid, void or refunded invoice because recomputing a
 * settled document rewrites history. `number` comes from
 * `fn_invoice_next_number`, which is gapless under a per-clinic advisory lock.
 */
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  sessionId: uuid("session_id"),
  number: text("number").notNull(),
  /** draft | issued | paid | partially_paid | void | refunded */
  state: text("state").notNull().default("draft"),
  currency: text("currency").notNull().default("IRR"),
  subtotal: numeric("subtotal", { precision: 12, scale: 0 }).notNull().default("0"),
  discount: numeric("discount", { precision: 12, scale: 0 }).notNull().default("0"),
  tax: numeric("tax", { precision: 12, scale: 0 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 0 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 0 }).notNull().default("0"),
  /** cash | card | transfer | gateway | credit */
  paymentMethod: text("payment_method"),
  paymentRef: text("payment_ref"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("invoices_clinic_number_live_uq")
    .on(t.clinicId, t.number)
    .where(sql`deleted_at IS NULL`),
]);

/**
 * Invoice lines. `description` and `unitPrice` are COPIED from the product when
 * the line is added: an invoice issued last month must not change because the
 * catalog changed today. `productId` is a reference for reporting, not the price
 * source. `lineTotal` is derived by a BEFORE trigger, so a client cannot post a
 * line whose total disagrees with quantity x price.
 */
export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull(),
  invoiceId: uuid("invoice_id").notNull(),
  productId: uuid("product_id"),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 0 }).notNull(),
  discount: numeric("discount", { precision: 12, scale: 0 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 12, scale: 0 }).notNull().default("0"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("invoice_items_position_live_uq")
    .on(t.invoiceId, t.position)
    .where(sql`deleted_at IS NULL`),
]);

/**
 * تلاش‌های پرداخت — بلاکر B3 (مایگریشن 0021).
 *
 * جای چهار Map درون‌حافظه‌ی PaymentService. حالتِ پرداخت روی دیسک است، پس
 * ری‌استارت authority را گم نمی‌کند و رپلیکای دوم authority دوم نمی‌سازد.
 *
 * ماشین حالت: pending → started → callback_received → verified | failed،
 * و pending | started → expired برای کسی که برنگشت. گذارها در ریپو با
 * compare-and-set انجام می‌شوند و حالت‌های پایانی گذار ندارند.
 *
 * یکتاییِ «یک تلاش فعال برای هر فاکتور» جزئی است و شرطِ حالت را در خودش
 * دارد: تلاش verified/failed/expired باید بگذارد تلاش تازه‌ای شروع شود، وگرنه
 * یک پرداخت ناموفق فاکتور را برای همیشه قفل می‌کند.
 */
export const paymentAttempts = pgTable("payment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinics.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  /** تا پاسخ پروایدر خالی است — ردیف پیش از تماس با درگاه ساخته می‌شود. */
  authority: text("authority").notNull().default(""),
  /** ریال، عدد صحیح. مانده‌ی فاکتور در لحظه شروع تلاش. */
  amount: bigint("amount", { mode: "number" }).notNull(),
  redirectUrl: text("redirect_url"),
  /** pending | started | callback_received | verified | failed | expired */
  status: text("status").notNull().default("pending"),
  provider: text("provider").notNull().default("zarinpal"),
  providerRefId: text("provider_ref_id"),
  errorReason: text("error_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("payment_attempts_active_invoice_uq")
    .on(t.invoiceId)
    .where(sql`status NOT IN ('verified', 'failed', 'expired') AND deleted_at IS NULL`),
  uniqueIndex("payment_attempts_authority_uq")
    .on(t.authority)
    .where(sql`authority <> '' AND deleted_at IS NULL`),
  index("payment_attempts_clinic_invoice_idx")
    .on(t.clinicId, t.invoiceId)
    .where(sql`deleted_at IS NULL`),
  index("payment_attempts_open_expiry_idx")
    .on(t.expiresAt)
    .where(sql`status IN ('pending', 'started') AND deleted_at IS NULL`),
]);

/**
 * webhook_providers — ارائه‌دهندگان وبهوک را به کلینیک متصل می‌کند.
 *
 * B1: مسیرهای وبهوک @Public() هستند و JwtAccessGuard رد می‌شود. این جدول
 * به WebhookGuard اجازه می‌دهد بعد از تأیید HMAC، clinicId را پیدا کند
 * و از طریق TenantScope.enter() context را روی store بنویسد.
 *
 * provider + clinic_id یکتایی دارند. provider_active_uq روی active=true
 * برای lookup سریع در WebhookGuard ایجاد شده.
 */
export const webhookProviders = pgTable("webhook_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  clinicId: uuid("clinic_id").notNull().references(() => clinics.id),
  webhookSecret: text("webhook_secret").notNull(),
  signatureHeader: text("signature_header").notNull().default("x-webhook-signature"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("webhook_providers_provider_clinic_uq").on(t.provider, t.clinicId),
  uniqueIndex("webhook_providers_provider_active_uq")
    .on(t.provider)
    .where(sql`active = true AND deleted_at IS NULL`),
]);
