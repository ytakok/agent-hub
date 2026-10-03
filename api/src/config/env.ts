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
  FIREBASE_PROJECT_ID: z.string().min(1).default('demo-agency-hub'),
  /** Web API key, used only for username login (Identity Toolkit). Any value works against the emulator. */
  FIREBASE_WEB_API_KEY: z.string().default('demo-key'),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
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
