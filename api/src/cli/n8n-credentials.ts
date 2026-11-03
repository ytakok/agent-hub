/**
 * Platform-operator CLI: create a customer's n8n credentials from their connection sheet
 * (the text they copy from the SMB Automation /connect page). Needs N8N_BASE_URL and N8N_API_KEY in api/.env.
 *
 *   npm run build -w api
 *   npm run n8n:credentials -w api -- --customer "Acme" --file sheet.txt            (preview, nothing created)
 *   npm run n8n:credentials -w api -- --customer "Acme" --file sheet.txt --apply    (creates the credentials)
 *
 * Without --file, paste the sheet and finish with Ctrl+Z then Enter (Windows) or Ctrl+D (macOS/Linux).
 * The sheet holds secrets: delete the file afterwards. Running --apply twice creates duplicates.
 */
import { readFile } from 'node:fs/promises';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppConfigModule } from '../config/config.module.js';
import { N8nCredentialsModule } from '../n8n-credentials/n8n-credentials.controller.js';
import { N8nCredentialsService } from '../n8n-credentials/n8n-credentials.service.js';

/** Only what this command needs: no Firebase, no HTTP server. */
@Module({ imports: [AppConfigModule, N8nCredentialsModule] })
class N8nCredentialsCliModule {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY)
    console.error('Paste the connection sheet, then press Ctrl+Z and Enter (Ctrl+D on macOS/Linux):');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const customer = arg('customer');
  if (!customer) throw new Error('Pass --customer "<customer name>".');
  const file = arg('file');
  const sheet = file ? await readFile(file, 'utf8') : await readStdin();

  const app = await NestFactory.createApplicationContext(N8nCredentialsCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(N8nCredentialsService);

    if (!process.argv.includes('--apply')) {
      const preview = await service.preview(sheet, customer);
      for (const c of preview.credentials) {
        const fields = Object.entries(c.fields)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        const missing = c.missingRequired.length
          ? `  ⚠ n8n also requires: ${c.missingRequired.join(', ')}`
          : '';
        console.log(
          `• ${c.name}  [${c.type}]${c.needsSignIn ? '  (sign-in needed)' : ''}\n    ${fields}${missing}`,
        );
      }
      printList('Problems', preview.problems);
      printList('Afterwards', preview.notes);
      if (!preview.n8nConfigured)
        console.log(
          '\nn8n is not configured, so the schemas were not checked. Set N8N_BASE_URL and N8N_API_KEY.',
        );
      console.log(`\nPreview only: ${preview.credentials.length} credential(s). Add --apply to create them.`);
      return;
    }

    const result = await service.import(sheet, customer);
    for (const c of result.created)
      console.log(`✓ ${c.name}  ${c.url}${c.needsSignIn ? '  ← open it and click Sign in' : ''}`);
    for (const c of result.failed) console.log(`✗ ${c.name}  [${c.type}]: ${c.error}`);
    printList('Problems', result.problems);
    printList('Afterwards', result.notes);
    if (result.created.some((c) => c.needsSignIn)) {
      console.log(
        "\nGoogle and Microsoft credentials need one sign-in with the customer's account (screen-share works well).",
      );
    }
    if (result.failed.length) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

function printList(title: string, items: string[]): void {
  if (items.length) console.log(`\n${title}:\n${items.map((i) => `  - ${i}`).join('\n')}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
