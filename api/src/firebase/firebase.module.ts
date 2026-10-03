import { Global, Logger, Module } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
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
        const projectId = config.get('FIREBASE_PROJECT_ID');
        // With *_EMULATOR_HOST set, the Admin SDK talks to the local emulators and needs no credentials.
        if (config.usingEmulators) {
          new Logger('Firebase').warn(`Using Firebase emulators for project "${projectId}"`);
          return initializeApp({ projectId });
        }
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
