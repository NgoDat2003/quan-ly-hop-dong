import { z } from 'zod';

// Validates only the env vars this app actually reads. Every var here has a
// default matching the same fallback already hardcoded in code
// (JwtStrategy/AccessControlModule use 'dev-placeholder-secret'), so this
// does not tighten the "boots with no .env file present" guarantee — it
// only turns a genuinely malformed value into a clear boot-time error
// instead of a confusing runtime failure later.
const envSchema = z.object({
  JWT_SECRET: z.string().min(1).default('dev-placeholder-secret'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
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

  // The default JWT_SECRET is public (checked into source control) and only
  // safe for local dev boot-without-.env convenience. Refuse to boot in
  // production with it still set — that would let anyone forge a valid JWT
  // for any user id.
  if (result.data.NODE_ENV === 'production' && result.data.JWT_SECRET === 'dev-placeholder-secret') {
    throw new Error(
      'JWT_SECRET must be set explicitly in production, refusing to boot with the default dev secret',
    );
  }

  return result.data;
}
