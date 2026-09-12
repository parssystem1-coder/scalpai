/**
 * FIXTURE - deliberately incomplete (ADR-21). This module mounts NOTHING, which
 * is exactly what makes the controller and the service beside it findings: a
 * class no module registers has no call-site.
 *
 * Never imported, never built, never typechecked - walk.ts ignores every
 * directory named `fixtures`.
 */
import { Module } from "@nestjs/common";

@Module({
  controllers: [],
  providers: [],
})
export class AppModule {}
