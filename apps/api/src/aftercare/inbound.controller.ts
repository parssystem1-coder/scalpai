import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { InboundMessageIngest, type InboundMessageIngestDto } from "@scalpai/shared";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { WebhookGuard, WebhookSignature } from "../billing/webhook.guard.js";
import { AftercareService } from "./aftercare.service.js";

/** Provider callback entrypoint. Signature verification runs before ingestion. */
@Controller("aftercare/webhooks")
@UseGuards(WebhookGuard)
export class InboundController {
  constructor(private readonly aftercare: AftercareService) {}

  @Post("kavenegar")
  @WebhookSignature("kavenegar")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestKavenegar(@Body(new ZodBodyPipe(InboundMessageIngest)) dto: InboundMessageIngestDto) {
    return this.aftercare.ingestInbound(dto);
  }

  @Post("zarinpal")
  @WebhookSignature("zarinpal")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestZarinpal(@Body(new ZodBodyPipe(InboundMessageIngest)) dto: InboundMessageIngestDto) {
    return this.aftercare.ingestInbound(dto);
  }
}
