import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn } from '@angular/router';
import type { FeatureKey, Role } from '@agency-hub/shared';
import { TenantConfigService } from '../tenant/tenant-config.service';
import { AuthService } from './auth.service';

/** Signed in and linked to an organization. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  if (auth.needsOnboarding()) return router.createUrlTree(['/auth/complete-profile']);
  return true;
};

/** Login/signup pages: bounce signed-in users to the app. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree([auth.needsOnboarding() ? '/auth/complete-profile' : '/app/dashboard']);
};

/** Signed in with Firebase but no organization yet. */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  if (!auth.needsOnboarding()) return router.createUrlTree(['/app/dashboard']);
  return true;
};

// Note: inject() only works before the first `await` in a guard — resolve every dependency up front.

export function roleGuard(...roles: Role[]): CanMatchFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.ready();
    const role = auth.role();
    return (role !== null && roles.includes(role)) || router.createUrlTree(['/app/dashboard']);
  };
}

/**
 * Route is reachable only when the tenant has every listed feature enabled.
 * canMatch runs before the parent's canActivate, so wait for the session first.
 */
export function featureGuard(...features: FeatureKey[]): CanMatchFn {
  return async () => {
    const auth = inject(AuthService);
    const tenantConfig = inject(TenantConfigService);
    const router = inject(Router);
    await auth.ready();
    if (!auth.tenantId()) return router.createUrlTree(['/auth/login']);
    const cfg = await tenantConfig.load();
    return (!!cfg && features.every((f) => cfg.features[f])) || router.createUrlTree(['/app/dashboard']);
  };
}
