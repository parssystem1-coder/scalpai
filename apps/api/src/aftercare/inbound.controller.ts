import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { InboundMessageIngest, type InboundMessageIngestDto } from "@scalpai/shared";
import { Public } from "../auth/jwt-access.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { RateLimit } from "../common/rate-limit.guard.js";
import { WebhookGuard, WebhookSignature } from "../billing/webhook.guard.js";
import { AftercareService } from "./aftercare.service.js";

/**
 * Provider callback entrypoint. Signature verification runs before ingestion.
 *
 * D23: این کنترلر فقط قرارداد پیام ورودی است. زرین‌پال هرگز از اینجا عبور
 * نمی‌کند — callback پرداختِ آن همان `POST /billing/payment/callback` است و
 * مسیر `aftercare/webhooks/zarinpal` حذف شد (پرسش باز ۳ سند
 * docs/reviews/PHASE-5AB-REVIEW.md؛ ADR-0057 همراه این تغییر در ledger ثبت است).
 */
@Controller("aftercare/webhooks")
@UseGuards(WebhookGuard)
export class InboundController {
  constructor(private readonly aftercare: AftercareService) {}

  @Public()
  @Post("kavenegar")
  @WebhookSignature("kavenegar")
  @RateLimit("webhook-kavenegar", 600)
  @HttpCode(HttpStatus.ACCEPTED)
  ingestKavenegar(@Body(new ZodBodyPipe(InboundMessageIngest)) dto: InboundMessageIngestDto) {
    // The provider is selected by the signed route, not by a client-controlled
    // `channel`/`provider` field in the payload.
    return this.aftercare.ingestInbound({ ...dto, channel: "kavenegar", provider: "kavenegar" });
  }
}
