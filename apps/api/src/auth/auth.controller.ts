import { Body, Controller, Post } from "@nestjs/common";
import { DbService } from "@scalpai/db";
import { LoginRequest, RefreshRequest, TokenPair, type LoginRequest as LoginReq } from "@scalpai/shared";
import type { RefreshRequest as RefreshDto } from "@scalpai/shared";
import { AuthService } from "./auth.service.js";
import { Public } from "./jwt-access.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";

@Public()
@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService, private db: DbService,
  ) {}

  @Post("login")
  login(@Body(new ZodBodyPipe(LoginRequest)) dto: LoginReq): Promise<TokenPair> {
    return this.db.withClient((tx) => this.auth.login(tx, dto.email, dto.password));
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
