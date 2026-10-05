import { Global, Logger, Module } from '@nestjs/common';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { AppConfig } from '../config/app-config.service.js';

export const FIREBASE_APP = Symbol('FIREBASE_APP');
export const FIREBASE_AUTH = Symbol('FIREBASE_AUTH');
export const FIRESTORE = Symbol('FIRESTORE');

@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_APP,
      inject: [AppConfig],
      useFactory: (config: AppConfig): App => {
        const existing = getApps()[0];
        if (existing) return existing;
        const logger = new Logger('Firebase');
        const projectId = config.get('FIREBASE_PROJECT_ID');
        const authEmulator = Boolean(config.get('FIREBASE_AUTH_EMULATOR_HOST'));
        const firestoreEmulator = Boolean(config.get('FIRESTORE_EMULATOR_HOST'));
        // The web app must sign in to the same Auth (emulator vs real) and project, or every token is rejected (401).
        logger.log(
          `Project "${projectId}" · Auth: ${authEmulator ? 'emulator' : 'REAL Firebase'} · Firestore: ${firestoreEmulator ? 'emulator' : 'REAL Firebase'}`,
        );

        // Fully on emulators: no credentials needed.
        if (authEmulator && firestoreEmulator) return initializeApp({ projectId });

        // Any real service needs a service account (token revocation checks, custom claims, custom tokens).
        // cert() signs custom tokens locally with the key; applicationDefault() would need the IAM signBlob API enabled.
        const keyJson = config.get('FIREBASE_SERVICE_ACCOUNT_JSON');
        const keyFile = config.get('GOOGLE_APPLICATION_CREDENTIALS');
        if (keyJson) {
          logger.log('Credentials: service account from FIREBASE_SERVICE_ACCOUNT_JSON');
          return initializeApp({ projectId, credential: cert(JSON.parse(keyJson) as object) });
        }
        if (keyFile) return initializeApp({ projectId, credential: cert(keyFile) });
        logger.error(
          'Real Firebase is in use but no service account is configured. Set GOOGLE_APPLICATION_CREDENTIALS (key file path) ' +
            'or FIREBASE_SERVICE_ACCOUNT_JSON (key JSON). Firebase console → Project settings → Service accounts.',
        );
        return initializeApp({ projectId, credential: applicationDefault() });
      },
    },
    { provide: FIREBASE_AUTH, inject: [FIREBASE_APP], useFactory: (app: App) => getAuth(app) },
    {
      provide: FIRESTORE,
      inject: [FIREBASE_APP],
      useFactory: (app: App) => {
        const db = getFirestore(app);
        db.settings({ ignoreUndefinedProperties: true });
        return db;
      },
    },
  ],
  exports: [FIREBASE_APP, FIREBASE_AUTH, FIRESTORE],
})
export class FirebaseModule {}
