import { Controller, Param, Post, Query } from "@nestjs/common";
import { Public } from "../auth/jwt-access.guard.js";
import { Roles } from "../common/roles.guard.js";
import { PaymentService } from "./payment.service.js";

/** HTTP boundary for gateway redirect and callback transitions. */
@Controller("billing/payment")
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post(":invoiceId/start")
  @Roles("owner", "trichologist", "receptionist")
  start(@Param("invoiceId") invoiceId: string) {
    // The callback URL is deployment configuration, not client-controlled input.
    return this.payments.start(invoiceId);
  }

  @Public()
  @Post("callback")
  callback(@Query("invoiceId") invoiceId: string, @Query("Authority") authority: string, @Query("Status") status?: string) {
    return this.payments.callback(invoiceId, authority, status);
  }
}
