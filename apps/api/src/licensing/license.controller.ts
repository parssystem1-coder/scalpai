import { Controller, Get } from "@nestjs/common";
import type { LicenseStatusDto } from "@scalpai/shared";
import { Roles } from "../common/roles.guard.js";
import { LicenseService } from "./license.service.js";

/**
 * Phase 10 (M2): the ONE place a licence verdict comes from.
 *
 * It is authenticated (the global JWT guard) and readable by any clinic role,
 * because "is this installation licensed" is operational information the whole
 * clinic sees in the diagnostics panel. It is deliberately NOT tenant data: a
 * self-hosted licence covers the installation, so no clinic scope is applied and
 * no database transaction is opened.
 *
 * The response never contains the token or the private key — only the verdict,
 * the public claims and the fingerprint of the key that verified it.
 */
@Controller("license")
export class LicenseController {
  constructor(private licenses: LicenseService) {}

  @Get("status")
  @Roles("owner", "trichologist", "receptionist")
  status(): LicenseStatusDto {
    return this.licenses.status();
  }
}
