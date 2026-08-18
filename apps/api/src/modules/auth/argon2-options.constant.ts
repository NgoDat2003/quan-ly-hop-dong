// OWASP minimum recommended params for Argon2id — kept lower than the
// package default because /auth/refresh (public, high-frequency, 15m access
// TTL) also hashes with this profile; every argon2.hash call in this
// codebase MUST use the same params, or DUMMY_HASH's timing-safety
// guarantee in auth.service.ts breaks (verify against a hash with different
// cost params takes measurably different time than verify against a real
// user's hash).
export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
