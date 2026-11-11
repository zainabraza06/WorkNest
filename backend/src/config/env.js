import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  STRIPE_SECRET_KEY: z
    .string()
    .optional()
    .refine((v) => !v || v.startsWith('sk_test_'), {
      message: 'Only Stripe TEST keys (sk_test_...) are allowed',
    }),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CURRENCY: z.string().default('pkr'),

  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_SERVICE_KEY: z.string().optional(),
  AI_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),

  // ── Operations ──
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  // Error tracking is opt-in: unset means the Sentry SDK is never initialised
  SENTRY_DSN: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.05),
  // Bearer token for GET /metrics. In production the endpoint stays disabled without one.
  METRICS_TOKEN: z.string().min(16).optional().or(z.literal('').transform(() => undefined)),
  // redis:// or rediss:// (TLS). Optional: unset = single-instance in-memory behaviour.
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must start with redis:// or rediss://').optional().or(z.literal('').transform(() => undefined)),
  DB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  // How many reverse proxies sit in front of the API (Render/Heroku = 1). Wrong values let
  // clients spoof their IP and walk around the rate limiter.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  // ── Keep-alive (free-tier hosts that sleep idle services) ──
  // While awake, the API pings its own public URL and the AI service so the platform never sees
  // it idle. Off by default; see src/keepAlive.js for the free-hours budget.
  KEEP_ALIVE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  KEEP_ALIVE_INTERVAL_SEC: z.coerce.number().int().min(60).max(840).default(600), // under Render's 15 min idle limit
  KEEP_ALIVE_HOURS: z.string().optional().or(z.literal('').transform(() => undefined)), // e.g. "7-23"; unset = always
  KEEP_ALIVE_TZ: z.string().default('Asia/Karachi'),
  KEEP_ALIVE_URLS: z.string().optional().or(z.literal('').transform(() => undefined)), // extra comma-separated URLs
  RENDER_EXTERNAL_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)), // set by Render itself
});

// Rules that only matter once real users and real money are involved
const productionRules = schema.superRefine((v, ctx) => {
  if (v.NODE_ENV !== 'production') return;
  if (v.JWT_SECRET.length < 32) {
    ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'must be at least 32 characters in production' });
  }
  if (v.CLIENT_URL.split(',').some((o) => o.trim() === '*')) {
    ctx.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: 'wildcard origins are not allowed in production' });
  }
  if (/localhost|127\.0\.0\.1/.test(v.MONGODB_URI)) {
    ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'must not point at localhost in production' });
  }
});

const parsed = productionRules.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((o) => o.trim()),
  // Render sets RENDER=true on every service it runs. A service created by hand in the dashboard
  // can easily be left on NODE_ENV=development, which silently turns off every production-only
  // protection (stack-trace hiding, the closed /metrics endpoint). Being hosted somewhere real
  // is treated as production for those behaviours, so forgetting the variable fails safe.
  isProd: parsed.data.NODE_ENV === 'production' || process.env.RENDER === 'true',
  misconfiguredEnv: process.env.RENDER === 'true' && parsed.data.NODE_ENV !== 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  logLevel: parsed.data.LOG_LEVEL ?? (parsed.data.NODE_ENV === 'test' ? 'silent' : parsed.data.NODE_ENV === 'production' ? 'info' : 'debug'),
};
