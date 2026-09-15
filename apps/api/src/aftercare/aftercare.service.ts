import { Injectable } from "@nestjs/common";
import {
  errors,
  type AftercareEnrollmentCreateDto,
  type AftercareSequenceCreateDto,
  type AftercareSequenceUpdateDto,
  type InboundMessageIngestDto,
  type MessagingChannel,
} from "@scalpai/shared";
import {
  AftercareError,
  type AftercareStepRow,
  type ClaimedEnrollment,
  type EnrollmentRow,
  type SequenceRow,
  type Tx,
} from "@scalpai/db";
import {
  getAdapter,
  previewBody,
  redactRecipient,
  redactVars,
  renderTemplate,
  routeChannel,
  type SendResult,
} from "@scalpai/notify";
import { metrics } from "../common/metrics.js";
import { MeteringService } from "../metering/metering.service.js";
import { TenantScope, type TenantCtx } from "../tenancy/tenant.scope.js";
import { AftercareRepository } from "./aftercare.repository.js";

/**
 * موتور Aftercare (فاز ۵a / ADR-0046).
 *
 * پیام‌رسانی عمداً در سه گام و دو تراکنش انجام می‌شود:
 *
 *   ۱) تراکنش اول — برداشتن کار سررسیده، رندر، ثبت ردیف queued و متر کردن.
 *   ۲) بیرون از تراکنش — فراخوانی پروایدر.
 *   ۳) تراکنش دوم — ثبت نتیجه و جلو بردن ثبت‌نام.
 *
 * نگه داشتن تراکنش روی یک فراخوانی شبکه‌ای، دقیقاً همان دامی است که فاز ۹
 * برایش idle_in_transaction_session_timeout گذاشت: یک پروایدر کند، کل pool را
 * با خودش می‌برد.
 *
 * کلید idempotency جفتِ (enrollment, step) است. ورکری که بین گام ۲ و ۳ می‌میرد،
 * دفعه بعد همان کلید را می‌سازد، ردیف تکراری ثبت نمی‌شود و بیمار پیام دوم
 * را نمی‌گیرد.
 */

/** پیشوند tag برای opt-in کانال‌های مسنجری — مثلاً `msg:telegram`. */
export const OPT_IN_TAG_PREFIX = "msg:";

/** سقف کارِ برداشته‌شده در هر tick برای هر کلینیک. یک کلینیک نباید tick را بخورد. */
export const AFTERCARE_BATCH_PER_CLINIC = 50;

interface PendingSend {
  messageId: string;
  enrollmentId: string;
  attempts: number;
  channel: MessagingChannel;
  recipient: string;
  body: string;
  locale: "fa" | "en";
  idempotencyKey: string;
  templateKey: string;
}

interface SkippedStep {
  enrollmentId: string;
  attempts: number;
  messageId?: string;
  reason: string;
  /** true یعنی گام را رها کن و جلو برو؛ false یعنی عقب بینداز و دوباره تلاش کن. */
  advance: boolean;
}

@Injectable()
export class AftercareService {
  constructor(
    private repo: AftercareRepository,
    private scope: TenantScope,
    private metering: MeteringService,
  ) {}

  /* ══ sequences ═════════════════════════════════════════════════ */

  listSequences(page: { limit: number; offset: number }): Promise<SequenceRow[]> {
    return this.repo.listSequences(page);
  }

  async getSequence(id: string): Promise<SequenceRow> {
    const sequence = await this.repo.getSequence(id);
    if (!sequence) throw errors.notFound();
    return sequence;
  }

  createSequence(dto: AftercareSequenceCreateDto): Promise<SequenceRow> {
    return this.repo.createSequence({
      name: dto.name,
      description: dto.description,
      trigger: dto.trigger,
      serviceId: dto.serviceId,
      locale: dto.locale,
      steps: dto.steps as AftercareStepRow[],
      active: dto.active,
    });
  }

  async updateSequence(id: string, dto: AftercareSequenceUpdateDto): Promise<SequenceRow> {
    const updated = await this.repo.updateSequence(id, {
      name: dto.name,
      description: dto.description,
      trigger: dto.trigger,
      serviceId: dto.serviceId,
      locale: dto.locale,
      steps: dto.steps as AftercareStepRow[] | undefined,
      active: dto.active,
    });
    if (!updated) throw errors.notFound();
    return updated;
  }

  async deleteSequence(id: string): Promise<{ deleted: true }> {
    const ok = await this.repo.deleteSequence(id);
    if (!ok) throw errors.notFound();
    return { deleted: true };
  }

  /* ══ enrollments ══════════════════════════════════════════════ */

  listEnrollments(filter: {
    patientId?: string | undefined;
    sequenceId?: string | undefined;
    state?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<EnrollmentRow[]> {
    return this.repo.listEnrollments(filter);
  }

  async getEnrollment(id: string): Promise<EnrollmentRow> {
    const enrollment = await this.repo.getEnrollment(id);
    if (!enrollment) throw errors.notFound();
    return enrollment;
  }

  /**
   * ثبت‌نام. دوباره‌کلیک (یکتایی جزئی روی ثبت‌نام فعال) به 409 ترجمه می‌شود
   * نه ۵۰۰: کاربر دو بار دکمه زده، سرور خراب نشده.
   */
  async enroll(dto: AftercareEnrollmentCreateDto): Promise<EnrollmentRow> {
    try {
      const enrollment = await this.repo.createEnrollment({
        sequenceId: dto.sequenceId,
        patientId: dto.patientId,
        sessionId: dto.sessionId,
        locale: dto.locale,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      });
      if (!enrollment) {
        throw errors.conflict("این بیمار هم‌اکنون در این دنباله فعال است");
      }
      return enrollment;
    } catch (err) {
      if (err instanceof AftercareError) throw errors.conflict(err.message);
      throw err;
    }
  }

  async act(id: string, action: "pause" | "resume" | "cancel", reason?: string): Promise<EnrollmentRow> {
    try {
      const enrollment = await this.repo.actOnEnrollment(id, action, reason);
      if (!enrollment) throw errors.notFound();
      return enrollment;
    } catch (err) {
      if (err instanceof AftercareError) throw errors.conflict(err.message);
      throw err;
    }
  }

  /* ══ inbox ═════════════════════════════════════════════════════ */

  listInbox(filter: {
    state?: string | undefined;
    channel?: string | undefined;
    patientId?: string | undefined;
    limit: number;
    offset: number;
  }) {
    return this.repo.listInbox(filter);
  }

  /** متن کامل یک پیام ورودی — رمزگشایی، پس یک کنش جداگانه و قابل audit. */
  async readInbound(id: string): Promise<{ id: string; body: string }> {
    const body = await this.repo.readInboundBody(id);
    if (body === null) throw errors.notFound();
    return { id, body };
  }

  async updateInbound(id: string, state: string, intent?: string): Promise<{ updated: true }> {
    const ok = await this.repo.setInboundState(id, state, intent);
    if (!ok) throw errors.notFound();
    return { updated: true };
  }

  listMessages(filter: {
    patientId?: string | undefined;
    enrollmentId?: string | undefined;
    state?: string | undefined;
    channel?: string | undefined;
    limit: number;
    offset: number;
  }) {
    return this.repo.listMessages(filter);
  }

  /**
   * دریافت یک پیام ورودی.
   *
   * متن همینجا به دو شکل تبدیل می‌شود: پاکت رمزشده (در ریپو) و پیش‌نمایش
   * scrub شده. متن خام از این متد بیرون نمی‌رود.
   */
  async ingestInbound(dto: InboundMessageIngestDto) {
    const intent = classifyIntent(dto.body);
    const recorded = await this.repo.recordInbound({
      channel: dto.channel,
      provider: dto.provider,
      providerMessageId: dto.providerMessageId,
      from: dto.from,
      body: dto.body,
      preview: previewBody(dto.body),
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
      intent,
    });
    metrics.counter("scalpai_inbound_messages_total", {
      channel: dto.channel,
      intent,
      duplicate: String(recorded.duplicate),
    });
    return { id: recorded.id, duplicate: recorded.duplicate, intent };
  }

  /* ══ delivery ═════════════════════════════════════════════════ */

  /**
   * یک دور برای یک کلینیک. ورکر این را درون `TenantScope.runWith` فراخوانی
   * می‌کند، پس همان مرز tenancy مسیر HTTP را دارد.
   */
  async runDue(ctx: TenantCtx, clinicName: string, batch = AFTERCARE_BATCH_PER_CLINIC): Promise<number> {
    const { pending, skipped } = await this.scope.tx(async (tx) => {
      const claimed = await this.repo.claimDue(tx, ctx.clinicId, batch);
      const pendingSends: PendingSend[] = [];
      const skippedSteps: SkippedStep[] = [];
      for (const job of claimed) {
        const outcome = await this.prepare(tx, ctx, clinicName, job);
        if ("reason" in outcome) skippedSteps.push(outcome);
        else pendingSends.push(outcome);
      }
      return { pending: pendingSends, skipped: skippedSteps };
    });

    // گام ۲ — بیرون از هر تراکنشی.
    const results = await Promise.all(
      pending.map(async (job) => {
        try {
          const adapter = getAdapter(job.channel);
          const result = await adapter.send({
            channel: job.channel,
            to: job.recipient,
            body: job.body,
            locale: job.locale,
            idempotencyKey: job.idempotencyKey,
            meta: { templateKey: job.templateKey },
          });
          return { job, result } as const;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { job, result: { outcome: "rejected", provider: job.channel, reason: message, retryable: false } as SendResult } as const;
        }
      }),
    );

    // گام ۳ — ثبت نتیجه و حرکت بعدی.
    await this.scope.tx(async (tx) => {
      for (const step of skipped) {
        if (step.messageId) await this.repo.markSuppressedInTx(tx, ctx.clinicId, step.messageId, step.reason);
        if (step.advance) await this.repo.advanceInTx(tx, ctx.clinicId, step.enrollmentId);
        else await this.repo.deferInTx(tx, ctx.clinicId, step.enrollmentId, step.attempts);
      }
      for (const { job, result } of results) {
        if (result.outcome === "accepted") {
          await this.repo.markSentInTx(tx, ctx.clinicId, job.messageId, result.provider, result.providerMessageId);
          await this.repo.advanceInTx(tx, ctx.clinicId, job.enrollmentId);
        } else {
          await this.repo.markFailedInTx(tx, ctx.clinicId, job.messageId, result.reason ?? "send failed");
          // پیامی که نرفت، سهمیه را نباید بسوزاند
          await this.metering.refund(tx, ctx.clinicId, "messages_sent");
          await this.repo.deferInTx(tx, ctx.clinicId, job.enrollmentId, job.attempts);
        }
        metrics.counter("scalpai_messages_total", { channel: job.channel, outcome: result.outcome });
      }
    });

    return pending.length + skipped.length;
  }

  /**
   * آماده کردن یک گام: مخاطب، کانال، متن، ردیف دفتر، متر.
   *
   * هر خروجی جز ارسال، دلیل دارد و در دفتر پیام ثبت می‌شود. رد کردن ساکت،
   * در پشتیبانی به «ما هیچ‌وقت پیام نگرفتیم» تبدیل می‌شود و قابل دفاع نیست.
   */
  private async prepare(
    tx: Tx,
    ctx: TenantCtx,
    clinicName: string,
    job: ClaimedEnrollment,
  ): Promise<PendingSend | SkippedStep> {
    const step = job.stepsSnapshot[job.currentStep];
    if (!step) {
      return { enrollmentId: job.enrollmentId, attempts: job.attempts, reason: "step-missing", advance: true };
    }

    const patient = await this.repo.patientInTx(tx, ctx.clinicId, job.patientId);
    if (!patient) {
      // بیمار soft-delete شده — دنباله باید تمام شود، نه تا ابد retry
      return { enrollmentId: job.enrollmentId, attempts: job.attempts, reason: "patient-gone", advance: true };
    }

    const recipient = (patient as { phone?: string }).phone ?? "";
    const tags = (patient as { tags?: string[] | null }).tags ?? [];
    const optedIn = tags
      .filter((tag) => tag.startsWith(OPT_IN_TAG_PREFIX))
      .map((tag) => tag.slice(OPT_IN_TAG_PREFIX.length) as MessagingChannel);
    const optedOut = recipient ? await this.repo.optedOutInTx(tx, ctx.clinicId, recipient) : false;

    const decision = routeChannel({
      preferred: step.channel as MessagingChannel,
      recipient: { optedIn, hasMobile: recipient.length > 0, optedOut },
      requiresReply: false,
    });
    if (!decision.ok) {
      return { enrollmentId: job.enrollmentId, attempts: job.attempts, reason: decision.reason, advance: true };
    }

    const locale = job.locale === "en" ? "en" : "fa";
    const vars = { clinicName, ...(step.vars ?? {}) };
    let rendered;
    try {
      rendered = renderTemplate(step.templateKey, vars, {
        locale,
        channel: decision.channel,
        maxChars: decision.adapter.capabilities.maxBodyChars,
      });
    } catch (err) {
      // قالب خراب یا متغیر غایب: retry هم درستش نمی‌کند، پس گام رها می‌شود
      return {
        enrollmentId: job.enrollmentId,
        attempts: job.attempts,
        reason: `template: ${err instanceof Error ? err.message : String(err)}`,
        advance: true,
      };
    }

    const idempotencyKey = `${job.enrollmentId}:${job.currentStep}`;
    const enqueued = await this.repo.enqueueInTx(tx, ctx.clinicId, {
      enrollmentId: job.enrollmentId,
      patientId: job.patientId,
      stepIndex: job.currentStep,
      channel: decision.channel,
      templateKey: rendered.templateKey,
      locale,
      recipient,
      body: rendered.body,
      varsRedacted: redactVars(vars),
      idempotencyKey,
      provider: decision.adapter.provider,
    });
    if (enqueued.duplicate) {
      // این گام قبلاً رفته (ورکر قبلی بین ارسال و ثبت مرد). دوباره نمی‌فرستیم.
      return { enrollmentId: job.enrollmentId, attempts: job.attempts, reason: "already-sent", advance: true };
    }

    const verdict = await this.metering.count(tx, ctx.clinicId, "messages_sent");
    if (!verdict.allowed) {
      // سقف پلن یک خطای تحویل نیست — suppressed است نه failed، و گام رها می‌شود
      return {
        enrollmentId: job.enrollmentId,
        attempts: job.attempts,
        messageId: enqueued.id,
        reason: "quota-exceeded",
        advance: true,
      };
    }

    return {
      messageId: enqueued.id,
      enrollmentId: job.enrollmentId,
      attempts: job.attempts,
      channel: decision.channel,
      recipient,
      body: rendered.body,
      locale,
      idempotencyKey,
      templateKey: rendered.templateKey,
    };
  }

  /** فقط برای پیام خطای قابل لاگ — مخاطب کامل هرگز لاگ نمی‌شود. */
  static describeRecipient(recipient: string): string {
    return redactRecipient(recipient);
  }
}

/**
 * دسته‌بندی خیلی ساده‌ی مقصود پیام ورودی.
 *
 * عمداً کلیدواژه‌ای است و نه مدل: تنها تصمیمی که رویش گرفته می‌شود STOP است، و
 * STOP باید قابل خواندن، قابل تست و قابل توضیح دادن به یک بازرس باشد، نه خروجی
 * یک مدل که روزی نظرش عوض می‌شود.
 */
export function classifyIntent(body: string): "unknown" | "question" | "reschedule" | "stop" | "confirm" {
  const text = body.trim().toLowerCase();
  if (/^(stop|unsubscribe|لغو|توقف|قطع)\b/.test(text) || text === "لغو پیامک") return "stop";
  if (/(تاریخ|نوبت|جابجا|تغییر وقت|reschedule|postpone)/.test(text)) return "reschedule";
  if (/(بله|تأیید|تایید|اوکی|ok|yes|confirm)/.test(text)) return "confirm";
  if (text.includes("؟") || text.includes("?")) return "question";
  return "unknown";
}
