import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@agency-hub/shared';
import { PLATFORM_ADMIN, ROLES } from '../decorators/index.js';
import type { AuthedRequest } from '../request-user.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN, targets) && !user?.platformAdmin) {
      throw new ForbiddenException('Platform administrators only');
    }
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && (!user?.role || !roles.includes(user.role))) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
