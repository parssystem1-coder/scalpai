import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { sanitizeMessageError } from "@scalpai/shared";
import { inboundMessages, messageLog } from "../schema.js";
import { decryptPhi, encryptPhi, phiCiphertextKid } from "../phi-crypto.js";
import { newId, type Tx } from "../tenant.js";

/**
 * دروازه پیام — لایه داده (فاز ۵a / ADR-0046).
 *
 * دو قاعده که همه‌ی این فایل را توضیح می‌دهند:
 *
 *   ۱) شماره تلفن هرگز در هیچ ستونی نمی‌نشیند. `recipientDigest` قبل از هر
 *      INSERT فراخوانی می‌شود و قید `^[0-9a-f]{64}$` در 0017 تضمین می‌کند که یک
 *      مسیر فراموشکار نتواند موبایل خام را همانجا بگذارد — INSERT می‌شکند.
 *
 *   ۲) متن پیام خروجی ذخیره نمی‌شود (از قالب بازتولید می‌شود)، متن ورودی
 *      ذخیره می‌شود ولی فقط در پاکت `phi.v1.` با AAD بسته به همین ردیف. به
 *      همین دلیل `id` قبل از INSERT ساخته می‌شود: بدون شناسه، AAD به ردیف
 *      گره نمی‌خورد و کپی کردن یک blob از بیماری به بیمار دیگر ممکن می‌شود.
 */

export class MessagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingError";
  }
}

/** تنها شکلی که یک مخاطب مجاز است در دیتابیس دیده شود. */
export function recipientDigest(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new MessagingError("recipient is empty");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function bodyDigest(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

const INBOUND_BODY_FIELD = "body";
const INBOUND_ENTITY = "inbound_messages";

/* ══ outbound ═════════════════════════════════════════════════════ */

export interface MessageEnqueueInput {
  enrollmentId?: string | undefined;
  patientId?: string | undefined;
  stepIndex?: number | undefined;
  channel: string;
  templateKey: string;
  locale: string;
  /** شماره/شناسه خام. فقط همینجا دیده می‌شود و بلافاصله hash می‌شود. */
  recipient: string;
  /** متن رندرشده. فقط برای digest و طول استفاده می‌شود. */
  body: string;
  /** خروجی redactVars — هیچ کلید PHI ای. */
  varsRedacted: Record<string, unknown>;
  idempotencyKey: string;
  provider?: string | undefined;
}

export interface EnqueuedMessage {
  id: string;
  /** true یعنی همین کلید قبلاً ثبت شده بود و چیزی ارسال نشد. */
  duplicate: boolean;
  state: string;
}

/**
 * ثبت یک پیام در حالت queued.
 *
 * `onConflictDoNothing` روی یکتایی idempotency عمدی است و خطا نمی‌دهد: یک retry
 * شبکه‌ای یا دو بار برداشته شدن همان گام، باید به «قبلاً فرستادیم» ترجمه شود
 * نه به ۵۰۰. تفاوت این دو، دقیقاً تفاوت یک پیام و دو پیام برای بیمار است.
 */
export async function enqueueMessage(
  tx: Tx,
  clinicId: string,
  input: MessageEnqueueInput,
): Promise<EnqueuedMessage> {
  const rows = await tx
    .insert(messageLog)
    .values({
      clinicId,
      enrollmentId: input.enrollmentId ?? null,
      patientId: input.patientId ?? null,
      stepIndex: input.stepIndex ?? null,
      channel: input.channel,
      templateKey: input.templateKey,
      locale: input.locale,
      recipientHash: recipientDigest(input.recipient),
      bodySha256: bodyDigest(input.body),
      bodyChars: input.body.length,
      varsRedacted: input.varsRedacted,
      state: "queued",
      provider: input.provider ?? null,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: [messageLog.clinicId, messageLog.idempotencyKey] })
    .returning({ id: messageLog.id, state: messageLog.state });

  const inserted = rows[0];
  if (inserted) return { id: inserted.id, duplicate: false, state: inserted.state };

  const existing = await tx
    .select({ id: messageLog.id, state: messageLog.state })
    .from(messageLog)
    .where(and(eq(messageLog.clinicId, clinicId), eq(messageLog.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  const row = existing[0];
  if (!row) throw new MessagingError("message was neither inserted nor found by its idempotency key");
  return { id: row.id, duplicate: true, state: row.state };
}

/**
 * پروایدر تحویل گرفت. این sent است نه delivered — تفکیکِ مهمی است: فقط
 * کانال‌هایی که supportsDeliveryReceipt دارند هرگز به delivered می‌رسند.
 */
export async function markMessageSent(
  tx: Tx,
  clinicId: string,
  id: string,
  provider: string,
  providerMessageId?: string,
): Promise<boolean> {
  const rows = await tx
    .update(messageLog)
    .set({
      state: "sent",
      provider,
      providerMessageId: providerMessageId ?? null,
      sentAt: sql`now()`,
      attempts: sql`${messageLog.attempts} + 1`,
      lastError: null,
    })
    .where(and(eq(messageLog.clinicId, clinicId), eq(messageLog.id, id), eq(messageLog.state, "queued")))
    .returning({ id: messageLog.id });
  return rows.length > 0;
}

export async function markMessageDelivered(
  tx: Tx,
  clinicId: string,
  channel: string,
  providerMessageId: string,
): Promise<boolean> {
  const rows = await tx
    .update(messageLog)
    .set({ state: "delivered", deliveredAt: sql`now()` })
    .where(
      and(
        eq(messageLog.clinicId, clinicId),
        eq(messageLog.channel, channel),
        eq(messageLog.providerMessageId, providerMessageId),
        eq(messageLog.state, "sent"),
      ),
    )
    .returning({ id: messageLog.id });
  return rows.length > 0;
}

/**
 * موج ۴ (D15) — پر کردن ردیف یادآوری جلسه که fn_aftercare_claim_session_reminders
 * (0023) با placeholder ساخته است. claim یعنی INSERT؛ اینجا فقط recipient/body
 * واقعی جایگزین می‌شود — نه ردیف دوم — تا کلید idempotency ثابت بماند.
 * فقط ردیف queued پر می‌شود: ردیف sent/delivered هرگز دستکاری نمی‌شود.
 */
export async function fillSessionReminder(
  tx: Tx,
  clinicId: string,
  input: {
    id: string;
    channel: string;
    locale: string;
    recipient: string;
    body: string;
    varsRedacted: Record<string, unknown>;
    provider: string;
  },
): Promise<boolean> {
  const rows = await tx
    .update(messageLog)
    .set({
      channel: input.channel,
      locale: input.locale,
      recipientHash: recipientDigest(input.recipient),
      bodySha256: bodyDigest(input.body),
      bodyChars: input.body.length,
      varsRedacted: input.varsRedacted,
      provider: input.provider,
    })
    .where(
      and(
        eq(messageLog.clinicId, clinicId),
        eq(messageLog.id, input.id),
        eq(messageLog.state, "queued"),
      ),
    )
    .returning({ id: messageLog.id });
  return rows.length > 0;
}

/** دلیل فقط از مجموعهٔ بسته است — متن پروایدر/شماره هرگز در ستون نمی‌نشیند. */
export async function markMessageFailed(
  tx: Tx,
  clinicId: string,
  id: string,
  reason: string,
): Promise<boolean> {
  const rows = await tx
    .update(messageLog)
    .set({
      state: "failed",
      failedAt: sql`now()`,
      attempts: sql`${messageLog.attempts} + 1`,
      lastError: sanitizeMessageError(reason),
    })
    .where(and(eq(messageLog.clinicId, clinicId), eq(messageLog.id, id)))
    .returning({ id: messageLog.id });
  return rows.length > 0;
}

/** پیامی که router رد کرد. ثبت می‌شود تا پشتیبانی بتواند بگوید چرا نرفت. */
export async function markMessageSuppressed(
  tx: Tx,
  clinicId: string,
  id: string,
  reason: string,
): Promise<boolean> {
  const rows = await tx
    .update(messageLog)
    .set({ state: "suppressed", lastError: reason.slice(0, 300) })
    .where(and(eq(messageLog.clinicId, clinicId), eq(messageLog.id, id)))
    .returning({ id: messageLog.id });
  return rows.length > 0;
}

export interface MessageLogFilter {
  patientId?: string | undefined;
  enrollmentId?: string | undefined;
  state?: string | undefined;
  channel?: string | undefined;
  limit: number;
  offset: number;
}

export async function listMessages(tx: Tx, clinicId: string, filter: MessageLogFilter) {
  const conditions = [eq(messageLog.clinicId, clinicId)];
  if (filter.patientId) conditions.push(eq(messageLog.patientId, filter.patientId));
  if (filter.enrollmentId) conditions.push(eq(messageLog.enrollmentId, filter.enrollmentId));
  if (filter.state) conditions.push(eq(messageLog.state, filter.state));
  if (filter.channel) conditions.push(eq(messageLog.channel, filter.channel));

  // هیچ ستونی که متن یا مخاطب بدهد وجود ندارد — پس این SELECT فقط فراداده است
  return tx
    .select({
      id: messageLog.id,
      channel: messageLog.channel,
      templateKey: messageLog.templateKey,
      locale: messageLog.locale,
      state: messageLog.state,
      recipientHash: messageLog.recipientHash,
      bodySha256: messageLog.bodySha256,
      bodyChars: messageLog.bodyChars,
      attempts: messageLog.attempts,
      provider: messageLog.provider,
      providerMessageId: messageLog.providerMessageId,
      lastError: messageLog.lastError,
      queuedAt: messageLog.queuedAt,
      sentAt: messageLog.sentAt,
      deliveredAt: messageLog.deliveredAt,
      failedAt: messageLog.failedAt,
    })
    .from(messageLog)
    .where(and(...conditions))
    .orderBy(desc(messageLog.queuedAt))
    .limit(filter.limit)
    .offset(filter.offset);
}

/* ══ inbound ══════════════════════════════════════════════════════ */

export interface InboundRecordInput {
  channel: string;
  provider?: string | undefined;
  providerMessageId?: string | undefined;
  /** فرستنده خام. فقط همینجا دیده می‌شود. */
  from: string;
  /** متن خام. رمز می‌شود، هرگز خوانا ذخیره نمی‌شود. */
  body: string;
  /** پیش‌نمایش scrub شده (از previewBody در @scalpai/notify). */
  preview: string;
  patientId?: string | undefined;
  enrollmentId?: string | undefined;
  replyToMessageId?: string | undefined;
  receivedAt?: Date | undefined;
  intent?: string | undefined;
}

export interface RecordedInbound {
  id: string;
  duplicate: boolean;
}

/**
 * ثبت یک پیام ورودی.
 *
 * `id` قبل از INSERT ساخته می‌شود تا AAD بتواند به همین ردیف گره بخورد. بدون
 * آن، ciphertext فقط «متن رمزشده‌ی یک کلینیک» است و می‌توان آن را روی ردیف
 * دیگری گذاشت و همان متن را باز خواند — دقیقاً حمله‌ای که AAD در فاز ۶ بست.
 *
 * دو بار تحویل شدن یک webhook عادی است، پس یکتایی روی providerMessageId به
 * duplicate ترجمه می‌شود نه خطا — وگرنه پروایدر باز هم تلاش می‌کند.
 */
export async function recordInbound(
  tx: Tx,
  clinicId: string,
  input: InboundRecordInput,
): Promise<RecordedInbound> {
  const id = newId();
  const ciphertext = encryptPhi(input.body, {
    clinicId,
    entity: INBOUND_ENTITY,
    entityId: id,
    field: INBOUND_BODY_FIELD,
  });
  const kid = phiCiphertextKid(ciphertext);
  if (!kid) throw new MessagingError("inbound body did not produce a recognisable phi envelope");

  const rows = await tx
    .insert(inboundMessages)
    .values({
      id,
      clinicId,
      channel: input.channel,
      provider: input.provider ?? null,
      providerMessageId: input.providerMessageId ?? null,
      senderHash: recipientDigest(input.from),
      patientId: input.patientId ?? null,
      enrollmentId: input.enrollmentId ?? null,
      replyToMessageId: input.replyToMessageId ?? null,
      bodyEncrypted: ciphertext,
      bodyKeyId: kid,
      bodySha256: bodyDigest(input.body),
      bodyPreview: input.preview,
      state: "new",
      intent: input.intent ?? "unknown",
      ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
    })
    .onConflictDoNothing()
    .returning({ id: inboundMessages.id });

  const inserted = rows[0];
  if (inserted) return { id: inserted.id, duplicate: false };

  if (!input.providerMessageId) {
    throw new MessagingError("inbound insert conflicted without a provider message id to reconcile against");
  }
  const existing = await tx
    .select({ id: inboundMessages.id })
    .from(inboundMessages)
    .where(
      and(
        eq(inboundMessages.clinicId, clinicId),
        eq(inboundMessages.channel, input.channel),
        eq(inboundMessages.providerMessageId, input.providerMessageId),
      ),
    )
    .limit(1);
  const row = existing[0];
  if (!row) throw new MessagingError("inbound message was neither inserted nor found");
  return { id: row.id, duplicate: true };
}

export interface InboxFilter {
  state?: string | undefined;
  channel?: string | undefined;
  patientId?: string | undefined;
  limit: number;
  offset: number;
}

/** فهرست inbox. متن کامل اینجا نیست — فقط پیش‌نمایش scrub شده. */
export async function listInbox(tx: Tx, clinicId: string, filter: InboxFilter) {
  const conditions = [eq(inboundMessages.clinicId, clinicId)];
  if (filter.state) conditions.push(eq(inboundMessages.state, filter.state));
  if (filter.channel) conditions.push(eq(inboundMessages.channel, filter.channel));
  if (filter.patientId) conditions.push(eq(inboundMessages.patientId, filter.patientId));

  return tx
    .select({
      id: inboundMessages.id,
      channel: inboundMessages.channel,
      state: inboundMessages.state,
      intent: inboundMessages.intent,
      patientId: inboundMessages.patientId,
      senderHash: inboundMessages.senderHash,
      bodyPreview: inboundMessages.bodyPreview,
      receivedAt: inboundMessages.receivedAt,
      handledAt: inboundMessages.handledAt,
    })
    .from(inboundMessages)
    .where(and(...conditions))
    .orderBy(desc(inboundMessages.receivedAt))
    .limit(filter.limit)
    .offset(filter.offset);
}

/**
 * متن کامل یک پیام ورودی — endpoint جداگانه و نقش محدود، همان تفکیکی که فاز
 * ۶ بین لیست بیماران و یادداشت بالینی گذاشت. خواندن یک متن، یک کنش است نه
 * یک ستون در جدول.
 */
export async function readInboundBody(tx: Tx, clinicId: string, id: string): Promise<string | null> {
  const rows = await tx
    .select({ body: inboundMessages.bodyEncrypted })
    .from(inboundMessages)
    .where(and(eq(inboundMessages.clinicId, clinicId), eq(inboundMessages.id, id)))
    .limit(1);
  const token = rows[0]?.body;
  if (!token) return null;
  return decryptPhi(token, {
    clinicId,
    entity: INBOUND_ENTITY,
    entityId: id,
    field: INBOUND_BODY_FIELD,
  });
}

export async function setInboundState(
  tx: Tx,
  clinicId: string,
  id: string,
  userId: string | null,
  state: string,
  intent?: string,
): Promise<boolean> {
  const set: Record<string, unknown> = { state };
  if (intent !== undefined) set.intent = intent;
  // قید inbound_messages_handled_chk: هر حالتی جز new/archived زمان رسیدگی می‌خواهد
  if (state !== "new") {
    set.handledAt = sql`now()`;
    set.handledBy = userId;
  }
  const rows = await tx
    .update(inboundMessages)
    .set(set)
    .where(and(eq(inboundMessages.clinicId, clinicId), eq(inboundMessages.id, id)))
    .returning({ id: inboundMessages.id });
  return rows.length > 0;
}

/**
 * آیا این مخاطب STOP فرستاده؟ پاسخ از روی hash داده می‌شود، پس برای این
 * پرسش هم لازم نیست شماره در جایی نگه داشته شود.
 */
export async function isOptedOut(tx: Tx, clinicId: string, recipient: string): Promise<boolean> {
  const rows = await tx
    .select({ id: inboundMessages.id })
    .from(inboundMessages)
    .where(
      and(
        eq(inboundMessages.clinicId, clinicId),
        eq(inboundMessages.senderHash, recipientDigest(recipient)),
        eq(inboundMessages.intent, "stop"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
