import { Controller, Get, HttpException, HttpStatus, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { DbService } from "@scalpai/db";
import { Public } from "../auth/jwt-access.guard.js";
import { logEvent } from "../common/logging.js";
import { metrics } from "../common/metrics.js";
import { resolveMetricsToken } from "../common/observability.config.js";
import { RateLimit } from "../common/rate-limit.guard.js";
import { StateStore } from "../common/state/state.store.js";
import { evaluateReadiness, READINESS_TIMEOUT_MS_DEFAULT, type ReadinessReport } from "./readiness.js";
import { metricsAuthorized } from "./scrape-auth.js";

/**
 * Operational surface (WEAKNESSES L3, phase 9 / ADR-0042).
 *
 * `/health` (CoreController) stays what it always was: a liveness ping for the
 * container runtime. This controller adds what an operator and a monitoring
 * system need and the stack did not have:
 *
 *   GET /api/v1/health/live   - process liveness + uptime
 *   GET /api/v1/health/ready  - dependency readiness (503 when unservable)
 *   GET /api/v1/metrics       - Prometheus text, token gated
 *
 * All three are `@Public` (a probe cannot hold a JWT) and all three opt OUT of
 * the request budget with `max = 0`: a monitor polling every five seconds must
 * never be able to consume a clinic's rate limit, and must never be throttled
 * during the incident it exists to report.
 */
@Controller()
export class OpsController {
  constructor(
    private db: DbService,
    private state: StateStore,
  ) {}

  @Public()
  @RateLimit("ops-probe", 0)
  @Get("health/live")
  live(): { ok: true; uptimeSeconds: number } {
    return { ok: true, uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @RateLimit("ops-probe", 0)
  @Get("health/ready")
  async ready(): Promise<ReadinessReport> {
    const report = await evaluateReadiness(
      {
        database: () => this.db.ping(),
        // A write, not a read: a read-only Redis would still fail every limiter.
        sharedState: () => this.state.hit(this.state.key("probe", "ready"), 10_000),
      },
      READINESS_TIMEOUT_MS_DEFAULT,
    );

    metrics.gauge("scalpai_readiness", report.ok ? 1 : 0);
    metrics.gauge("scalpai_dependency_up", report.checks.database.ok ? 1 : 0, { dependency: "database" });
    metrics.gauge("scalpai_dependency_up", report.checks.sharedState.ok ? 1 : 0, { dependency: "shared_state" });

    if (!report.ok) {
      logEvent("error", { event: "health.not_ready", reason: report.checks.database.error ?? "database" });
      throw new HttpException(
        { code: "NOT_READY", message: "سرویس آماده پذیرش درخواست نیست", details: report },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return report;
  }

  @Public()
  @RateLimit("ops-probe", 0)
  @Get("metrics")
  scrape(@Req() req: FastifyRequest, @Res() reply: FastifyReply): void {
    const token = resolveMetricsToken();
    if (!token) throw new HttpException({ code: "NOT_FOUND", message: "یافت نشد" }, HttpStatus.NOT_FOUND);
    if (!metricsAuthorized(req.headers.authorization, token)) {
      throw new HttpException({ code: "UNAUTHORIZED", message: "دسترسی غیرمجاز" }, HttpStatus.UNAUTHORIZED);
    }
    void reply.type("text/plain; version=0.0.4; charset=utf-8").send(metrics.render());
  }
}
