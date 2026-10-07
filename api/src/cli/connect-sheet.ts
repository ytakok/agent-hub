/**
 * Platform-operator CLI: connect a Google Sheet to an organization (same checks as the Settings form).
 * Uses api/.env, so it talks to whichever Firebase project the API is configured for.
 *
 *   npm run build -w api
 *   npm run sheets:connect -w api -- --email owner@agency.com --sheet "<sheet URL or ID>" [--tab "Leads"]
 *   npm run sheets:connect -w api -- --tenant <tenantId> --sheet "<sheet URL or ID>"
 *   npm run sheets:connect -w api -- --email owner@agency.com --disconnect
 */
import { NestFactory } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import { AppModule } from '../app.module.js';
import { FIREBASE_AUTH } from '../firebase/firebase.module.js';
import { SheetsIntegrationService } from '../integrations/google-sheets/sheets-integration.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const auth = app.get<Auth>(FIREBASE_AUTH);
    const sheets = app.get(SheetsIntegrationService);

    let tenantId = arg('tenant');
    const email = arg('email');
    if (!tenantId && email) {
      const user = await auth.getUserByEmail(email);
      tenantId = user.customClaims?.['tenantId'] as string | undefined;
      if (!tenantId) throw new Error(`${email} is not linked to an organization yet (complete onboarding first).`);
    }
    if (!tenantId) throw new Error('Pass --email <owner email> or --tenant <tenantId>.');

    if (process.argv.includes('--disconnect')) {
      await sheets.disconnect(tenantId);
      console.log(`Disconnected Google Sheets for tenant ${tenantId}.`);
      return;
    }

    const sheet = arg('sheet');
    if (!sheet) throw new Error('Pass --sheet <Google Sheets URL or ID>.');
    const result = await sheets.connect(tenantId, { spreadsheet: sheet, sheetName: arg('tab') }, 'cli');
    if (!result.ok) {
      const email = (await sheets.status(tenantId)).serviceAccountEmail;
      throw new Error(`Could not read the sheet: ${result.error}${result.error === 'not_shared' ? ` (share it with ${email} as Viewer)` : ''}`);
    }
    console.log(`Connected "${result.spreadsheetTitle}" (${result.sheetName}) to tenant ${tenantId}: ${result.rowCount} rows, columns: ${result.columns?.join(', ')}`);
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
