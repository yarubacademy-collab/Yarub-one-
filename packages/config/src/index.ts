import { z } from 'zod';

/**
 * Single source of truth for environment configuration.
 * Fails fast at boot: a misconfigured deployment must never start silently.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  PREVIEW_ORIGIN: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  // Separate from AUTH_SECRET so session rotation and credential rotation
  // stay independent operations.
  CREDENTIAL_SECRET: z.string().min(32, 'CREDENTIAL_SECRET must be at least 32 characters'),
  AUTH_EMAIL_FROM: z.string().email().optional(),
  SMTP_URL: z.string().optional(),

  // Provider credentials are OPTIONAL by design.
  // A missing credential means the capability reports NOT_CONFIGURED.
  // It must never mean "return a plausible-looking fake result".
  TEXT_PRIMARY_API_KEY: z.string().optional(),
  TEXT_PRIMARY_BASE_URL: z.string().url().optional(),
  TEXT_PRIMARY_MODEL: z.string().optional(),
  TEXT_FALLBACK_API_KEY: z.string().optional(),
  TEXT_FALLBACK_BASE_URL: z.string().url().optional(),
  TEXT_FALLBACK_MODEL: z.string().optional(),

  IMAGE_API_KEY: z.string().optional(),
  IMAGE_BASE_URL: z.string().url().optional(),
  IMAGE_MODEL: z.string().optional(),

  VIDEO_API_KEY: z.string().optional(),
  VIDEO_BASE_URL: z.string().url().optional(),
  VIDEO_MODEL: z.string().optional(),

  SPEECH_API_KEY: z.string().optional(),
  SPEECH_BASE_URL: z.string().url().optional(),
  SPEECH_TTS_MODEL: z.string().optional(),
  SPEECH_STT_MODEL: z.string().optional(),

  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_MODEL: z.string().optional(),

  // Quotas. Video is the expensive one, so it gets its own ceiling.
  QUOTA_JOBS_PER_DAY: z.coerce.number().int().positive().default(200),
  QUOTA_IMAGES_PER_DAY: z.coerce.number().int().positive().default(100),
  QUOTA_VIDEO_SECONDS_PER_DAY: z.coerce.number().int().nonnegative().default(60),

  // Credits. Enforcement is off by default so a self-hosted single-user
  // install is not gated by an accounting system it does not need.
  CREDITS_ENABLED: z.coerce.boolean().default(false),

  // Payment provider. Absent credentials mean checkout reports
  // NEEDS_CREDENTIAL; nothing is ever simulated.
  PAYMENT_API_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_CHECKOUT_URL: z.string().url().optional(),
  CREDITS_SIGNUP_GRANT: z.coerce.number().nonnegative().default(0),

  RATE_LIMIT_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MAX_PROMPT_CHARS: z.coerce.number().int().positive().default(24_000),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Build-time guard: no secret-shaped value may reach the browser bundle. */
export function assertNoClientSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const leaked = Object.keys(env).filter(
    (k) => k.startsWith('NEXT_PUBLIC_') && /KEY|SECRET|TOKEN|PASSWORD/i.test(k),
  );
  if (leaked.length > 0) {
    throw new Error(`Secret-like NEXT_PUBLIC_ variables detected: ${leaked.join(', ')}`);
  }
}

export * from './crypto.js';
