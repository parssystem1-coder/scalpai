import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantScope } from "../tenancy/tenant.scope.js";

export const ROLES_KEY = "roles";
/** Role gate — persona matrix §1 of the design doc. */
export const Roles = (...roles: ("owner" | "trichologist" | "receptionist")[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const ctx = TenantScope.current();
    if (!ctx) throw new ForbiddenException();
    if (!required.includes(ctx.role)) throw new ForbiddenException();
    return true;
  }
}
