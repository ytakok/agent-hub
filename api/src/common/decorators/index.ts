import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { FeatureKey, Role } from '@agency-hub/shared';
import type { AuthedRequest, RequestUser } from '../request-user.js';

export const IS_PUBLIC = 'isPublic';
export const ALLOW_NO_TENANT = 'allowNoTenant';
export const ROLES = 'roles';
export const REQUIRED_FEATURES = 'requiredFeatures';
export const PLATFORM_ADMIN = 'platformAdmin';

/** Skips authentication entirely. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Authenticated, but the user may not belong to a tenant yet (signup bootstrap). */
export const AllowNoTenant = () => SetMetadata(ALLOW_NO_TENANT, true);

/** Restricts a route to the given tenant roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Route is available only when every listed feature flag is on for the caller's tenant. */
export const RequireFeature = (...features: FeatureKey[]) => SetMetadata(REQUIRED_FEATURES, features);

/** Restricts a route to platform operators (custom claim `platformAdmin`). */
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
