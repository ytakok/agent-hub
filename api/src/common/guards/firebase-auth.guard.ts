import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import type { Role } from '@agency-hub/shared';
import { FIREBASE_AUTH } from '../../firebase/firebase.module.js';
import { IS_PUBLIC } from '../decorators/index.js';
import type { AuthedRequest } from '../request-user.js';

const ROLES: readonly Role[] = ['owner', 'admin', 'agent', 'viewer'];

/** Verifies the Firebase ID token (including revocation) and attaches the user to the request. */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing bearer token');

    try {
      const decoded = await this.auth.verifyIdToken(token, true);
      const role = decoded['role'];
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified ?? false,
        tenantId: typeof decoded['tenantId'] === 'string' ? decoded['tenantId'] : undefined,
        role: ROLES.includes(role) ? (role as Role) : undefined,
        platformAdmin: decoded['platformAdmin'] === true,
      };
      return true;
    } catch {
      // Never echo the verification error: it can reveal token internals.
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
