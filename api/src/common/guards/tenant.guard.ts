import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_NO_TENANT, IS_PUBLIC } from '../decorators/index.js';
import type { AuthedRequest } from '../request-user.js';

/**
 * Every authenticated route is tenant-scoped unless marked @AllowNoTenant.
 * The tenant comes only from verified custom claims — never from params, query or body.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_NO_TENANT, targets)) return true;

    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user?.tenantId || !user.role) throw new ForbiddenException('Account is not linked to an organization');
    return true;
  }
}
