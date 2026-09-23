import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import {
  AftercareEnrollmentAction,
  AftercareEnrollmentCreate,
  AftercareEnrollmentQuery,
  AftercareSequenceCreate,
  AftercareSequenceUpdate,
  InboundMessageIngest,
  InboundMessageUpdate,
  InboxQuery,
  PaginationQuery,
  type AftercareEnrollmentActionDto,
  type AftercareEnrollmentCreateDto,
  type AftercareEnrollmentQueryDto,
  type AftercareSequenceCreateDto,
  type AftercareSequenceUpdateDto,
  type InboundMessageIngestDto,
  type InboundMessageUpdateDto,
  type InboxQueryDto,
} from "@scalpai/shared";
import { RequireFeature } from "../common/feature.guard.js";
import { Quota } from "../common/quota.guard.js";
import { RateLimit } from "../common/rate-limit.guard.js";
import { Roles } from "../common/roles.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { AftercareService } from "./aftercare.service.js";

/**
 * موتور Aftercare — سطح HTTP (فاز ۵a / ADR-0046).
 *
 * کنترلر عمداً نازک است: اعتبارسنجی در قرارداد zod، تصمیم در سرویس، داده
 * در ریپوزیتوری، و هیچ SQL ای اینجا.
 *
 * هر مسیر سه دروازه دارد: `@Roles` (ماتریس پرسونا)، `@RequireFeature("aftercare")`
 * (§9.1 — قاعده conformance که گیت پلن را اجبار می‌کند) و `@RateLimit`.
 *
 * درباره `POST inbound`: این مسیر مانند بقیه احتیاج به JWT دارد. یک webhook واقعیِ
 * پروایدر JWT ندارد و به یک guard مجزای مختصِ هر پروایدر با ورسیون امضا
 * نیاز دارد (فاز ۵b). تا آن موقع، باز گذاشتنِ یک مسیر نوشتنیِ بی‌احرازهویت
 * نیمه‌ی بدتر معامله است — یعنی هرکسی می‌تواند پیام جعلی در inbox یک کلینیک
 * بگذارد، و بدتر از آن، با متن "لغو" پیگیری بیماران را خاموش کند.
 */
@Controller("aftercare")
export class AftercareController {
  constructor(private aftercare: AftercareService) {}

  /* ── sequences ── */

  @Get("sequences")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  listSequences(@Query(new ZodBodyPipe(PaginationQuery)) q: { limit: number; offset: number }) {
    return this.aftercare.listSequences({ limit: q.limit, offset: q.offset });
  }

  @Post("sequences")
  @Roles("owner", "trichologist")
  @RequireFeature("aftercare")
  @RateLimit("aftercare-write", 120)
  @HttpCode(HttpStatus.CREATED)
  createSequence(@Body(new ZodBodyPipe(AftercareSequenceCreate)) dto: AftercareSequenceCreateDto) {
    return this.aftercare.createSequence(dto);
  }

  @Get("sequences/:id")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  getSequence(@Param("id") id: string) {
    return this.aftercare.getSequence(id);
  }

  @Patch("sequences/:id")
  @Roles("owner", "trichologist")
  @RequireFeature("aftercare")
  @RateLimit("aftercare-write", 120)
  updateSequence(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(AftercareSequenceUpdate)) dto: AftercareSequenceUpdateDto,
  ) {
    return this.aftercare.updateSequence(id, dto);
  }

  /**
   * soft-delete. هر ثبت‌نام فعالِ این دنباله هم لغو می‌شود — خاموش کردن یک
   * دنباله باید همان چیزی باشد که کاربر فکر می‌کند زده.
   */
  @Delete("sequences/:id")
  @Roles("owner")
  @RequireFeature("aftercare")
  @RateLimit("aftercare-write", 120)
  deleteSequence(@Param("id") id: string) {
    return this.aftercare.deleteSequence(id);
  }

  /* ── enrollments ── */

  @Get("enrollments")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  listEnrollments(@Query(new ZodBodyPipe(AftercareEnrollmentQuery)) q: AftercareEnrollmentQueryDto) {
    return this.aftercare.listEnrollments(q);
  }

  /**
   * موج ۳ (D11): ثبت‌نام آگاهانه‌ی مسیر ارسال پیام است، پس دروازه‌ی سهمیه‌ی پیام
   * را هم دارد. گارد فقط پیش‌چک ارزان است؛ حکم اتمیک همچنان meterUsage داخل
   * تراکنش ورکر است و ورکر به‌جای ۴۰۳، پیام را suppress می‌کند — ۴۰۳ یکنواخت
   * فقط برای درخواست‌های انسانی است.
   */
  @Post("enrollments")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  @Quota("messages")
  @RateLimit("aftercare-write", 120)
  @HttpCode(HttpStatus.CREATED)
  enroll(@Body(new ZodBodyPipe(AftercareEnrollmentCreate)) dto: AftercareEnrollmentCreateDto) {
    return this.aftercare.enroll(dto);
  }

  @Get("enrollments/:id")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  getEnrollment(@Param("id") id: string) {
    return this.aftercare.getEnrollment(id);
  }

  /** pause / resume / cancel — یک endpoint و یک مجموعه بسته، نه سه مسیر موازی. */
  @Post("enrollments/:id/actions")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  @Quota("messages")
  @RateLimit("aftercare-write", 120)
  @HttpCode(HttpStatus.OK)
  act(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(AftercareEnrollmentAction)) dto: AftercareEnrollmentActionDto,
  ) {
    return this.aftercare.act(id, dto.action, dto.reason);
  }

  /* ── inbox ── */

  @Get("inbox")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  listInbox(@Query(new ZodBodyPipe(InboxQuery)) q: InboxQueryDto) {
    return this.aftercare.listInbox(q);
  }

  /**
   * متن کامل یک پیام ورودی. مسیر جداگانه و نقش محدودتر، چون این یک
   * رمزگشایی است و باید مانند خواندن یادداشت بالینی رفتار شود — یک کنش، نه
   * یک ستون در فهرست.
   */
  @Get("inbox/:id/body")
  @Roles("owner", "trichologist")
  @RequireFeature("aftercare")
  @RateLimit("aftercare-read-body", 240)
  readInbound(@Param("id") id: string) {
    return this.aftercare.readInbound(id);
  }

  @Patch("inbox/:id")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  @RateLimit("aftercare-write", 120)
  updateInbound(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(InboundMessageUpdate)) dto: InboundMessageUpdateDto,
  ) {
    return this.aftercare.updateInbound(id, dto.state, dto.intent);
  }

  /**
   * دریافت پیام ورودی. فعلاً یک مسیر احرازهویت‌شده است (برای relay داخلی و
   * تست)، نه یک webhook عمومی. به متن بالای کلاس نگاه کنید.
   */
  @Post("inbound")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("aftercare")
  @RateLimit("aftercare-inbound", 600)
  @HttpCode(HttpStatus.ACCEPTED)
  ingest(@Body(new ZodBodyPipe(InboundMessageIngest)) dto: InboundMessageIngestDto) {
    return this.aftercare.ingestInbound(dto);
  }

  /* ── outbound ledger ── */

  /** دفتر پیام‌ها. بدون متن و بدون شماره — ستونی برایشان وجود ندارد. */
  @Get("messages")
  @Roles("owner", "trichologist")
  @RequireFeature("aftercare")
  listMessages(
    @Query(new ZodBodyPipe(AftercareEnrollmentQuery)) q: AftercareEnrollmentQueryDto,
  ) {
    return this.aftercare.listMessages({
      patientId: q.patientId,
      limit: q.limit,
      offset: q.offset,
    });
  }
}
