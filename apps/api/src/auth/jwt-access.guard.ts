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

    // Store must be entered synchronously, before any await, so the handler
    // continuation inherits it (see R3 in the phase-2 roadmap).
    TenantScope.enter({ clinicId: claims.clinicId, userId: claims.sub, role: claims.role });
    await this.auth.assertPrincipalActive(this.db, claims);
    return true;
  }
}
