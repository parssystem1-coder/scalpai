import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { InboundMessageIngest, type InboundMessageIngestDto } from "@scalpai/shared";
import { Public } from "../auth/jwt-access.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { RateLimit } from "../common/rate-limit.guard.js";
import { WebhookGuard, WebhookSignature } from "../billing/webhook.guard.js";
import { AftercareService } from "./aftercare.service.js";

/** Provider callback entrypoint. Signature verification runs before ingestion. */
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

  @Public()
  @Post("zarinpal")
  @WebhookSignature("zarinpal")
  @RateLimit("webhook-zarinpal", 600)
  @HttpCode(HttpStatus.ACCEPTED)
  ingestZarinpal(@Body(new ZodBodyPipe(InboundMessageIngest)) dto: InboundMessageIngestDto) {
    // Same rule as the Kavenegar route: the signed route owns the provider, the
    // payload does not get to claim one. `channel` still comes from the body
    // because Zarinpal is a payment provider and is not a messaging channel -
    // see docs/reviews/PHASE-5AB-REVIEW.md, open question 3: this route should
    // either move to a payment-event contract or be removed.
    return this.aftercare.ingestInbound({ ...dto, provider: "zarinpal" });
  }
}
