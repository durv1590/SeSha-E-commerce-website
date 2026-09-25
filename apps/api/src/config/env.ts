import { z } from 'zod';

/**
 * Environment configuration, validated once at boot. The process refuses to start
 * with missing or malformed configuration rather than failing later at runtime.
 * Every variable is documented in docs/ENVIRONMENT.md.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Public origin of the storefront, used for CORS and links in emails. */
    APP_URL: z.string().url().default('http://localhost:3000'),
    /** Comma-separated list of additional origins allowed by CORS. */
    CORS_ORIGINS: z.string().default(''),
    /** Number of reverse proxies (CDN, load balancer) in front of the API; used for client IPs. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => v.startsWith('postgres'), 'must be a postgresql:// URL'),
    /** Queries slower than this are logged as warnings. */
    DB_SLOW_QUERY_MS: z.coerce.number().int().min(1).default(250),

    /** Required in production (shared cache + rate limits across instances). */
    REDIS_URL: z
      .string()
      .url()
      .refine((v) => v.startsWith('redis'), 'must be a redis:// or rediss:// URL')
      .optional(),

    /** Global rate limit: requests per window per client IP. */
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'is required in production (shared cache and rate limiting)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return parsed.data;
}

export function allowedOrigins(env: Env): string[] {
  const extra = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return Array.from(new Set([new URL(env.APP_URL).origin, ...extra]));
}
