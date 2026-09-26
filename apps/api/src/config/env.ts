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
    /** Kill switch for rate limiting — only for automated tests; always true in production. */
    RATE_LIMIT_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    /** Signs access tokens (HS256). ≥ 32 random characters; rotate by redeploying. */
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Keys the HMAC used to hash refresh tokens and OTP codes at rest. ≥ 32 characters. */
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Optional parent domain for cookies (e.g. ".seshakart.com"); unset = host-only (recommended). */
    COOKIE_DOMAIN: z.string().optional(),

    /** Email delivery. Without SMTP_HOST, emails are logged (development/test only). */
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().default('SeShaKart <no-reply@seshakart.com>'),
    /** SMS delivery for mobile OTPs. "console" logs codes (dev); "none" disables mobile OTP. */
    SMS_PROVIDER: z.enum(['console', 'none']).default('console'),

    /** Where uploaded/generated media lives. "local" = disk (single server / dev); "s3" arrives with the admin phase. */
    MEDIA_DRIVER: z.enum(['local']).default('local'),
    /** Local media directory (absolute, or relative to the API package). */
    MEDIA_LOCAL_DIR: z.string().default('uploads'),
    /** Public URL prefix for media, e.g. https://cdn.seshakart.com (CDN) or /api/media (default). */
    MEDIA_PUBLIC_BASE: z.string().default('/api/media'),

    /**
     * Payment gateway. "mock" simulates payments for development and tests (never
     * allowed in production). Secrets stay server-side; only the key id is public.
     */
    PAYMENT_PROVIDER: z.enum(['razorpay', 'mock']).default('mock'),
    PAYMENT_KEY_ID: z.string().optional(),
    PAYMENT_KEY_SECRET: z.string().optional(),
    PAYMENT_WEBHOOK_SECRET: z.string().optional(),
    /** Override for the gateway API base URL (tests / sandboxes). */
    PAYMENT_API_BASE: z.string().url().optional(),

    /**
     * Storefront (Next.js) base URL on the private network, e.g. http://web:3000. After
     * catalogue or settings changes the API asks it to refresh its cached pages at once.
     */
    WEB_INTERNAL_URL: z.string().url().optional(),
    /** Shared secret for that request (≥ 32 characters, same value in the web app). */
    REVALIDATE_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const require = (path: keyof typeof env, ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };
    require('REDIS_URL', Boolean(
      env.REDIS_URL,
    ), 'is required in production (shared cache and rate limiting)');
    require('SMTP_HOST', Boolean(
      env.SMTP_HOST,
    ), 'is required in production (OTP and order emails)');
    require('SMS_PROVIDER', env.SMS_PROVIDER !==
      'console', 'cannot be "console" in production (codes would only be logged)');
    require('JWT_SECRET', env.JWT_SECRET !== env.SESSION_SECRET, 'must differ from SESSION_SECRET');
    require('RATE_LIMIT_ENABLED', env.RATE_LIMIT_ENABLED, 'cannot be disabled in production');
    require('PAYMENT_PROVIDER', env.PAYMENT_PROVIDER !== 'mock', 'cannot be "mock" in production');
    require('WEB_INTERNAL_URL', Boolean(
      env.WEB_INTERNAL_URL,
    ), 'is required in production (storefront refresh after admin changes)');
  })
  .superRefine((env, ctx) => {
    if (env.WEB_INTERNAL_URL && !env.REVALIDATE_SECRET)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REVALIDATE_SECRET'],
        message: 'is required with WEB_INTERNAL_URL',
      });
    // A real gateway needs all three credentials, whatever the environment.
    if (env.PAYMENT_PROVIDER === 'mock') return;
    for (const key of ['PAYMENT_KEY_ID', 'PAYMENT_KEY_SECRET', 'PAYMENT_WEBHOOK_SECRET'] as const) {
      if (!env[key])
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `is required for ${env.PAYMENT_PROVIDER}`,
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
