import { Body, Controller, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { DbService } from "@scalpai/db";
import { LoginRequest, RefreshRequest, TokenPair, type LoginRequest as LoginReq } from "@scalpai/shared";
import type { RefreshRequest as RefreshDto } from "@scalpai/shared";
import { AuthService } from "./auth.service.js";
import { LoginThrottleService } from "./login-throttle.service.js";
import { Public } from "./jwt-access.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";

@Public()
@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService, private db: DbService, private throttle: LoginThrottleService,
  ) {}

  @Post("login")
  async login(@Req() req: FastifyRequest, @Body(new ZodBodyPipe(LoginRequest)) dto: LoginReq): Promise<TokenPair> {
    const ip = req.ip ?? "unknown";
    this.throttle.assertIpAllowed(ip);
    this.throttle.assertEmailAllowed(dto.email);
    try {
      const pair = await this.db.withClient((tx) => this.auth.login(tx, dto.email, dto.password));
      this.throttle.noteSuccess(dto.email);
      return pair;
    } catch (err) {
      if ((err as { status?: number }).status === 401) this.throttle.noteFailure(dto.email);
      throw err;
    }
  }

  @Post("refresh")
  refresh(@Body(new ZodBodyPipe(RefreshRequest)) dto: RefreshDto): Promise<TokenPair> {
    return this.auth.rotate(this.db, dto.refreshToken);
  }

  /** Client drops its refresh token; the family it belongs to dies with it. */
  @Post("logout")
  async logout(@Body(new ZodBodyPipe(RefreshRequest)) dto: RefreshDto): Promise<{ ok: true }> {
    await this.auth.revoke(this.db, dto.refreshToken);
    return { ok: true };
  }
}
