import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { BootstrapUserRequest, Locale, Role, Tenant, UserProfile } from '@agency-hub/shared';
import type { RequestUser } from '../common/request-user.js';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.module.js';
import { DEFAULT_TENANT_SETTINGS } from '../feature-flags/flag-definitions.js';
import { USER_SETTINGS_COLLECTION, defaultUserSettings } from '../user-settings/user-settings.service.js';

export const DEFAULT_BRANDING: Tenant['branding'] = {
  logoUrl: '/tenants/demo-insurance/logo.svg',
  colors: { primary: '#1f5eff', secondary: '#0f2a5c', accent: '#14b8a6', bg: '#f5f7fb', surface: '#ffffff', text: '#0f172a' },
  font: "'Rubik', system-ui, sans-serif",
  radius: '12px',
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
  ) {}

  async getProfile(uid: string): Promise<UserProfile> {
    const snap = await this.db.doc(`users/${uid}`).get();
    if (!snap.exists) throw new NotFoundException('Profile not found');
    return snap.data() as UserProfile;
  }

  /**
   * Deleting a user in the Firebase console removes only the Auth record; the app's Firestore records stay and
   * keep the username reserved. If the username's owner no longer exists in Firebase Auth, free it and remove
   * that user's leftover profile records. The organization and its data are kept (they may have other members).
   * Returns true when the username is free afterwards.
   */
  async releaseUsernameIfOrphaned(username: string): Promise<boolean> {
    const ref = this.db.doc(`usernames/${username}`);
    const snap = await ref.get();
    if (!snap.exists) return true;
    const uid = snap.get('uid') as string;
    const owner = await this.auth.getUser(uid).catch((e: { code?: string }) => {
      if (e.code === 'auth/user-not-found') return null;
      throw e;
    });
    if (owner) return false;

    const tenantId = (await this.db.doc(`users/${uid}`).get()).get('tenantId') as string | undefined;
    const batch = this.db.batch();
    batch.delete(ref);
    batch.delete(this.db.doc(`users/${uid}`));
    batch.delete(this.db.doc(`userSettings/${uid}`));
    batch.delete(this.db.doc(`emailOtps/${uid}`));
    if (tenantId) batch.delete(this.db.doc(`tenants/${tenantId}/members/${uid}`));
    await batch.commit();
    this.logger.log(`Released the username of deleted account ${uid}`);
    return true;
  }

  async updateProfile(uid: string, patch: { displayName?: string; phone?: string }): Promise<UserProfile> {
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.displayName !== undefined) update['displayName'] = patch.displayName;
    if (patch.phone !== undefined) update['phone'] = patch.phone;
    await this.db.doc(`users/${uid}`).update(update);
    return this.getProfile(uid);
  }

  /**
   * First call after signup (email or Google). Creates the profile, reserves the username and links the user
   * to a tenant — a new one they own, or an existing one via invitation. Idempotent once linked.
   */
  async bootstrap(user: RequestUser, dto: BootstrapUserRequest): Promise<UserProfile> {
    if (user.tenantId) return this.getProfile(user.uid);

    const authUser = await this.auth.getUser(user.uid);
    const email = authUser.email ?? '';
    const username = dto.username.trim().toLowerCase();
    const now = new Date().toISOString();
    await this.releaseUsernameIfOrphaned(username);

    const { tenantId, role } = await this.db.runTransaction(async (tx) => {
      const usernameRef = this.db.doc(`usernames/${username}`);
      if ((await tx.get(usernameRef)).exists) throw new ConflictException('Username is already taken');

      let tenantId: string;
      let role: Role;
      if (dto.inviteCode) {
        const codeHash = createHash('sha256').update(dto.inviteCode).digest('hex');
        const invites = await tx.get(
          this.db.collectionGroup('invitations').where('codeHash', '==', codeHash).where('status', '==', 'pending').limit(1),
        );
        const invite = invites.docs[0];
        if (!invite || invite.get('expiresAt') < now || invite.get('email') !== email.toLowerCase()) {
          throw new ForbiddenException('Invitation is invalid or expired');
        }
        tenantId = invite.ref.parent.parent!.id;
        role = invite.get('role') as Role;
        tx.update(invite.ref, { status: 'accepted', acceptedBy: user.uid, acceptedAt: now });
      } else {
        const tenantRef = this.db.collection('tenants').doc();
        tenantId = tenantRef.id;
        role = 'owner';
        const name = dto.companyName?.trim() || dto.displayName;
        const tenant: Omit<Tenant, 'id'> = {
          name,
          slug: slugify(name) || tenantId.toLowerCase(),
          plan: 'starter',
          status: 'trial',
          timezone: 'Asia/Jerusalem',
          currency: 'ILS',
          locales: { default: dto.language, supported: ['he', 'en'] },
          branding: DEFAULT_BRANDING,
          createdAt: now,
        };
        tx.set(tenantRef, tenant);
        tx.set(tenantRef.collection('config').doc('settings'), DEFAULT_TENANT_SETTINGS);
      }

      const profile: UserProfile = {
        uid: user.uid,
        email,
        username,
        displayName: dto.displayName,
        photoURL: authUser.photoURL,
        tenantId,
        role,
        status: 'active',
        authProviders: authUser.providerData.map((p) => p.providerId),
        createdAt: now,
        updatedAt: now,
      };
      tx.set(usernameRef, { uid: user.uid });
      tx.set(this.db.doc(`users/${user.uid}`), profile);
      tx.set(this.db.doc(`${USER_SETTINGS_COLLECTION}/${user.uid}`), { ...defaultUserSettings(dto.language), updatedAt: now });
      tx.set(this.db.doc(`tenants/${tenantId}/members/${user.uid}`), { role, joinedAt: now });
      return { tenantId, role };
    });

    // Claims are the only source of tenant identity on the server; the client must refresh its ID token now.
    await this.auth.setCustomUserClaims(user.uid, { ...authUser.customClaims, tenantId, role });
    user.tenantId = tenantId;
    user.role = role;
    return this.getProfile(user.uid);
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
