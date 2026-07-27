// HARNESS PROOF ONLY. This asserts a stub returns its stub value. It proves the
// test runner compiles and executes a decorated Nest service, nothing more.
// Delete or replace it the moment login() is implemented.
import { AuthService } from './auth.service';

describe('AuthService (harness proof)', () => {
  it('runs the Jest harness against a decorated Nest service', async () => {
    const service = new AuthService(null as never, null as never);
    await expect(
      service.login({ email: 'a@b.co', password: 'password' } as never),
    ).resolves.toMatchObject({
      accessToken: 'stub-token',
    });
  });
});
