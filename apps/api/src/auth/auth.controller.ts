import { Body, Controller, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { DbService } from "@scalpai/db";
import { LoginRequest, type AuthSession, type LoginRequest as LoginReq } from "@scalpai/shared";
import { AuthService, normalizeEmail } from "./auth.service.js";
import { LoginThrottleService } from "./login-throttle.service.js";
import { Public } from "./jwt-access.guard.js";
import { buildClearedRefreshCookie, buildRefreshCookie, readRefreshCookie } from "./refresh-cookie.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";

/**
 * Auth surface (WEAKNESSES H1 + R12). The refresh token is issued and read as
 * an HttpOnly/Secure/SameSite=Strict cookie only: it never appears in a
 * response body and the API does not accept it from one either.
 *
 * Phase 3: the throttle is backed by the shared store, so every call here is
 * awaited (its budget is per-clinic-wide, not per-process).
 */
@Public()
@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private db: DbService,
    private throttle: LoginThrottleService,
  ) {}

  @Post("login")
  async login(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body(new ZodBodyPipe(LoginRequest)) dto: LoginReq,
  ): Promise<AuthSession> {
    const ip = req.ip ?? "unknown";
    const email = normalizeEmail(dto.email);
    await this.throttle.assertBucketAllowed("login", ip);
    await this.throttle.assertEmailAllowed(email);
    try {
      const pair = await this.db.withClient((tx) => this.auth.login(tx, email, dto.password));
      await this.throttle.noteSuccess(email);
      void reply.header("set-cookie", buildRefreshCookie(pair.refreshToken));
      return { accessToken: pair.accessToken, user: pair.user };
    } catch (err) {
      if ((err as { status?: number }).status === 401) await this.throttle.noteFailure(email);
      throw err;
    }
  }

  @Post("refresh")
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthSession> {
    await this.throttle.assertBucketAllowed("refresh", req.ip ?? "unknown");
    const presented = readRefreshCookie(req);
    if (!presented) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "نشست یافت نشد" });
    }
    const pair = await this.auth.rotate(this.db, presented);
    await this.auth.forgetPrincipal(pair.user.id);
    void reply.header("set-cookie", buildRefreshCookie(pair.refreshToken));
    return { accessToken: pair.accessToken, user: pair.user };
  }

  /** The whole token family dies server-side, and the cookie is cleared. */
  @Post("logout")
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    await this.throttle.assertBucketAllowed("logout", req.ip ?? "unknown");
    const presented = readRefreshCookie(req);
    if (presented) await this.auth.revoke(this.db, presented);
    void reply.header("set-cookie", buildClearedRefreshCookie());
    return { ok: true };
  }
}
