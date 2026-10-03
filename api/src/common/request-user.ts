import type { Request } from 'express';
import type { Role } from '@agency-hub/shared';

export interface RequestUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  /** Undefined only before /users/bootstrap has assigned a tenant. */
  tenantId?: string;
  role?: Role;
  /** Platform operator (you), not a tenant role. Can change per-tenant feature flags. */
  platformAdmin: boolean;
}

/** User on a route that passed TenantGuard — tenantId and role are guaranteed. */
export type TenantUser = RequestUser & { tenantId: string; role: Role };

export interface AuthedRequest extends Request {
  user?: RequestUser;
}
