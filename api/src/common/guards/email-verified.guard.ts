import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_UNVERIFIED_EMAIL, IS_PUBLIC } from '../decorators/index.js';
import type { AuthedRequest } from '../request-user.js';

/**
 * Accounts must confirm their email (one-time code) before using the app. The flag comes from the verified
 * ID token (`email_verified`), so the client must refresh its token after verifying.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_EMAIL, targets)) return true;

    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user?.emailVerified) throw new ForbiddenException('email_not_verified');
    return true;
  }
}
