import { Controller, Get, Inject, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Auth } from 'firebase-admin/auth';
import { Public } from '../common/decorators/index.js';
import { AppConfig } from '../config/app-config.service.js';
import { FIREBASE_AUTH } from '../firebase/firebase.module.js';

/**
 * Liveness + configuration self-check for hosting platforms (Render/Cloud Run health checks) and debugging.
 * Reports configuration *shape* only — never key material, emails or tokens.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: AppConfig,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  async health() {
    const authEmulator = Boolean(this.config.get('FIREBASE_AUTH_EMULATOR_HOST'));
    const credentials = this.config.get('FIREBASE_SERVICE_ACCOUNT_JSON')
      ? 'json'
      : this.config.get('GOOGLE_APPLICATION_CREDENTIALS')
        ? 'file'
        : 'none';

    // Prove the admin credentials work: looking up a uid that can't exist must fail with user-not-found,
    // not with a credential/permission error.
    let firebaseAdmin: string;
    try {
      await this.auth.getUser('__health_check_nonexistent__');
      firebaseAdmin = 'ok';
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'unknown';
      firebaseAdmin = code === 'auth/user-not-found' ? 'ok' : code;
    }

    return {
      status: firebaseAdmin === 'ok' ? 'ok' : 'degraded',
      env: this.config.get('NODE_ENV'),
      dataMode: this.config.get('DATA_MODE'),
      projectId: this.config.get('FIREBASE_PROJECT_ID'),
      auth: authEmulator ? 'emulator' : 'firebase',
      firestore: this.config.get('FIRESTORE_EMULATOR_HOST') ? 'emulator' : 'firebase',
      credentials,
      firebaseAdmin,
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
