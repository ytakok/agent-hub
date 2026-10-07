/**
 * Platform-operator CLI: grant or revoke the `platformAdmin` claim (feature flags, connecting sheets).
 * The user must sign out and in again (or wait up to an hour) for the new claim to reach their token.
 *
 *   npm run platform-admin -w api -- grant you@example.com
 *   npm run platform-admin -w api -- revoke you@example.com
 */
import { NestFactory } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import { AppModule } from '../app.module.js';
import { FIREBASE_AUTH } from '../firebase/firebase.module.js';

async function main(): Promise<void> {
  const [action, email] = process.argv.slice(2).filter((a) => a !== '--');
  if (!['grant', 'revoke'].includes(action ?? '') || !email) throw new Error('Usage: platform-admin grant|revoke <email>');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const auth = app.get<Auth>(FIREBASE_AUTH);
    const user = await auth.getUserByEmail(email);
    const claims: Record<string, unknown> = { ...user.customClaims };
    if (action === 'grant') claims['platformAdmin'] = true;
    else delete claims['platformAdmin'];
    await auth.setCustomUserClaims(user.uid, claims);
    console.log(`${action === 'grant' ? 'Granted' : 'Revoked'} platformAdmin for ${email}. Sign out and in again to apply.`);
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
