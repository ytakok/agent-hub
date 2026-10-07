import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** `mock` serves generated data for every integration; `live` calls the real providers. */
  DATA_MODE: z.enum(['mock', 'live']).default('mock'),
  FIREBASE_PROJECT_ID: z.string().min(1).default('sample-app-5fff2'),
  /** Web API key, used only for username login (Identity Toolkit). Any value works against the emulator. */
  FIREBASE_WEB_API_KEY: z.string().default('demo-key'),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  /** Service-account key file, needed whenever Auth or Firestore is the real Firebase (not the emulator). */
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  /**
   * The same service-account key as JSON text — for hosts that inject secrets as env vars
   * (Cloud Run + Secret Manager). Takes precedence over GOOGLE_APPLICATION_CREDENTIALS.
   */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /**
   * Google Sheets reader: a dedicated service account with NO project roles — it can only read sheets that
   * agencies share with its email. JSON text (hosted) or a file path (local). Keep it separate from the Firebase key.
   */
  SHEETS_SERVICE_ACCOUNT_JSON: z.string().optional(),
  SHEETS_SERVICE_ACCOUNT_FILE: z.string().optional(),
  /** How long fetched sheet rows are reused before calling Google again. */
  SHEETS_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).default(300),
  CORS_ORIGINS: csv.pipe(z.array(z.url())).default(['http://localhost:4200']),
  N8N_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === 'production' && (parsed.data.FIREBASE_AUTH_EMULATOR_HOST || parsed.data.FIRESTORE_EMULATOR_HOST)) {
    throw new Error('Emulator hosts must not be set in production.');
  }
  return parsed.data;
}
