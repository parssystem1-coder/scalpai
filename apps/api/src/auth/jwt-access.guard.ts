import { type CanActivate, type ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { AuthService } from "./auth.service.js";

export const IS_PUBLIC = "is_public";
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Global guard: verifies JWT, then pins the tenant context for the request. */
@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private auth: AuthService,
    private scope: TenantScope,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "ØªÙˆÚ©Ù† Ø§Ø±Ø³Ø§Ù„ Ù†Ø´Ø¯Ù‡" });
    }
    try {
      const claims = this.auth.verifyAccess(token);
      TenantScope.enter({ clinicId: claims.clinicId, userId: claims.sub, role: claims.role });
      return true;
    } catch {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "ØªÙˆÚ©Ù† Ù†Ø§Ù…Ø¹ØªØ¨Ø± ÛŒØ§ Ù…Ù†Ù‚Ø¶ÛŒ" });
    }
  }
}
