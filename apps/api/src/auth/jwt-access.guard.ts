import { type CanActivate, type ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DbService } from "@scalpai/db";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { AuthService, type AccessClaims } from "./auth.service.js";

export const IS_PUBLIC = "is_public";
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Global guard: verifies the JWT, confirms the principal is still active,
 *  then pins the tenant context for the request. */
@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private auth: AuthService,
    private scope: TenantScope,
    private db: DbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "توکن ارسال نشده" });
    }

    let claims: AccessClaims;
    try {
      claims = this.auth.verifyAccess(token);
    } catch {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "توکن نامعتبر یا منقضی" });
    }

    // The store itself was opened by the onRequest hook (als.run), so writing to
    // it here is scoped to THIS request only — order of awaits no longer matters
    // and nothing leaks into a sibling continuation (WEAKNESSES R3).
    TenantScope.enter({ clinicId: claims.clinicId, userId: claims.sub, role: claims.role });
    await this.auth.assertPrincipalActive(this.db, claims);
    return true;
  }
}
