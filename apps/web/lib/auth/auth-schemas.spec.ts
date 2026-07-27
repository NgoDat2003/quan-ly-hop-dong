// HARNESS PROOF ONLY. This targets one of the few genuinely real (declarative)
// pieces of frontend code in the plan. It proves next/jest + jsdom + the `@/`
// alias all resolve, nothing more.
import { loginSchema } from './auth-schemas';

describe('loginSchema (harness proof)', () => {
  it('rejects an invalid email and a short password', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });

  it('accepts a valid email and an 8+ character password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'password123' }).success).toBe(true);
  });
});
