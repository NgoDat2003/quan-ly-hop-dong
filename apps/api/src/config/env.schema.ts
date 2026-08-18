import { z } from 'zod';

// Validates only the env vars this app actually reads. Every var here has a
// default matching the same fallback already hardcoded in code
// (JwtStrategy/AccessControlModule use 'dev-placeholder-secret'), so this
// does not tighten the "boots with no .env file present" guarantee — it
// only turns a genuinely malformed value into a clear boot-time error
// instead of a confusing runtime failure later.
const envSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-placeholder-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-placeholder-refresh-secret'),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_REFRESH_TTL: z.string().min(1).default('7d'),
  AUTH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  // The default secrets are public (checked into source control) and only
  // safe for local dev boot-without-.env convenience. Refuse to boot in
  // production with either one still set — that would let anyone forge a
  // valid access or refresh token for any user id.
  if (result.data.NODE_ENV === 'production') {
    if (result.data.JWT_ACCESS_SECRET === 'dev-placeholder-access-secret') {
      throw new Error(
        'JWT_ACCESS_SECRET must be set explicitly in production, refusing to boot with the default dev secret',
      );
    }
    if (result.data.JWT_REFRESH_SECRET === 'dev-placeholder-refresh-secret') {
      throw new Error(
        'JWT_REFRESH_SECRET must be set explicitly in production, refusing to boot with the default dev secret',
      );
    }
  }

  // Sharing one secret across access and refresh tokens defeats the reason
  // they're split in the first place — a leaked access token (short TTL,
  // seen by more code paths) would also let an attacker forge refresh
  // tokens (long TTL, session-granting power) if both were signed with the
  // same key.
  if (result.data.JWT_ACCESS_SECRET === result.data.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values');
  }

  // AUTH_COOKIE_SECURE=false means both cookies (including the 7-day
  // refresh token) get sent over plain HTTP with no Secure flag. Same class
  // of mistake as booting production with a default JWT secret — refuse
  // to boot rather than silently ship a session-hijackable cookie.
  if (result.data.NODE_ENV === 'production' && !result.data.AUTH_COOKIE_SECURE) {
    throw new Error(
      'AUTH_COOKIE_SECURE must be set to "true" in production (requires HTTPS), refusing to boot with auth cookies sent over plain HTTP',
    );
  }

  return result.data;
}
