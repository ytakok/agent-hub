import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import { ALLOW_NO_TENANT, IS_PUBLIC, PLATFORM_ADMIN, ROLES } from '../decorators/index.js';
import type { AuthedRequest } from '../request-user.js';
import { FirebaseAuthGuard } from './firebase-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { TenantGuard } from './tenant.guard.js';

function ctx(req: Partial<AuthedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function reflectorWith(meta: Record<string, unknown>): Reflector {
  return { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
}

describe('FirebaseAuthGuard', () => {
  const verifyIdToken = vi.fn();
  const guard = (meta: Record<string, unknown> = {}) =>
    new FirebaseAuthGuard(reflectorWith(meta), { verifyIdToken } as unknown as Auth);

  beforeEach(() => verifyIdToken.mockReset());

  it('rejects a request without a bearer token', async () => {
    await expect(guard().canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets @Public routes through without a token', async () => {
    await expect(guard({ [IS_PUBLIC]: true }).canActivate(ctx({ headers: {} }))).resolves.toBe(true);
  });

  it('checks revocation and maps claims onto req.user', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.c', email_verified: true, tenantId: 't1', role: 'agent' });
    const req: Partial<AuthedRequest> = { headers: { authorization: 'Bearer tok' } };
    await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith('tok', true);
    expect(req.user).toMatchObject({ uid: 'u1', tenantId: 't1', role: 'agent', platformAdmin: false });
  });

  it('ignores an unknown role claim', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', tenantId: 't1', role: 'superuser' });
    const req: Partial<AuthedRequest> = { headers: { authorization: 'Bearer tok' } };
    await guard().canActivate(ctx(req));
    expect(req.user?.role).toBeUndefined();
  });

  it('returns a generic 401 for revoked or invalid tokens', async () => {
    // Plain function rather than vi.fn(): the spy's result tracking reports the rejection as unhandled.
    const revoked = { verifyIdToken: () => Promise.reject(new Error('auth/id-token-revoked')) } as unknown as Auth;
    const err = await new FirebaseAuthGuard(reflectorWith({}), revoked)
      .canActivate(ctx({ headers: { authorization: 'Bearer tok' } }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).not.toContain('revoked');
  });
});

describe('TenantGuard', () => {
  it('requires a tenant claim by default', () => {
    expect(() => new TenantGuard(reflectorWith({})).canActivate(ctx({ user: { uid: 'u', emailVerified: true, platformAdmin: false } }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows tenant-less users only on @AllowNoTenant routes', () => {
    const req = ctx({ user: { uid: 'u', emailVerified: true, platformAdmin: false } });
    expect(new TenantGuard(reflectorWith({ [ALLOW_NO_TENANT]: true })).canActivate(req)).toBe(true);
  });
});

describe('RolesGuard', () => {
  const user = { uid: 'u', emailVerified: true, tenantId: 't', role: 'agent' as const, platformAdmin: false };

  it('blocks roles not in the list', () => {
    expect(() => new RolesGuard(reflectorWith({ [ROLES]: ['owner', 'admin'] })).canActivate(ctx({ user }))).toThrow(ForbiddenException);
  });

  it('allows listed roles', () => {
    expect(new RolesGuard(reflectorWith({ [ROLES]: ['agent'] })).canActivate(ctx({ user }))).toBe(true);
  });

  it('blocks platform-admin routes for tenant admins', () => {
    const admin = { ...user, role: 'owner' as const };
    expect(() => new RolesGuard(reflectorWith({ [PLATFORM_ADMIN]: true })).canActivate(ctx({ user: admin }))).toThrow(ForbiddenException);
  });
});
