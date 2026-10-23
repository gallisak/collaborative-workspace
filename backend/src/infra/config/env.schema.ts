import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DURATION_PATTERN } from '../../common/duration.js';

const duration = (fallback: string) =>
  z.string().regex(DURATION_PATTERN, 'expected duration like 900, 15m, 7d').default(fallback);

const PRODUCTION_SECRETS = ['JWT_ACCESS_SECRET', 'REFRESH_TOKEN_SECRET'] as const;
const INSECURE_SECRET = /change-me/i;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    COLLAB_PORT: z.coerce.number().int().positive().default(4001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PRETTY: z.stringbool().default(false),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    FRONTEND_URL: z.url().default('http://localhost:3000'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
    LOGIN_EMAIL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(5),
    LOGIN_IP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_ACCESS_TTL: duration('15m'),
    REFRESH_TOKEN_SECRET: z.string().min(16),
    REFRESH_TOKEN_TTL: duration('30d'),
    REFRESH_ROTATION_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(10),

    INVITATION_TTL: duration('7d'),

    COLLAB_FLUSH_INTERVAL_MS: z.coerce.number().int().min(50).default(1000),
    COLLAB_COMPACTION_THRESHOLD: z.coerce.number().int().min(1).default(100),
    COLLAB_MAX_MESSAGE_BYTES: z.coerce.number().int().positive().default(5_000_000),
    COLLAB_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(30_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    for (const key of PRODUCTION_SECRETS) {
      if (env[key].length < 32 || INSECURE_SECRET.test(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'must be a unique secret of at least 32 characters in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

const repoRoot = new URL('../../../../', import.meta.url);

export function envFilePaths(nodeEnv = process.env.NODE_ENV ?? 'development'): string[] {
  return [`.env.${nodeEnv}`, '.env'].map((name) => fileURLToPath(new URL(name, repoRoot)));
}
