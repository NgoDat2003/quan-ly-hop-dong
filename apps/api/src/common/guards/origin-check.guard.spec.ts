import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { OriginCheckGuard } from './origin-check.guard';

function mockContext(method: string, origin?: string): ExecutionContext {
  const request = { method, headers: origin ? { origin } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OriginCheckGuard', () => {
  const configService = { get: jest.fn().mockReturnValue('http://localhost:3002') };
  const guard = new OriginCheckGuard(configService as never);

  it('allows a POST request with a matching Origin header', () => {
    expect(guard.canActivate(mockContext('POST', 'http://localhost:3002'))).toBe(true);
  });

  it('rejects a POST request with a mismatched Origin header (403)', () => {
    expect(() => guard.canActivate(mockContext('POST', 'http://evil.com'))).toThrow(ForbiddenException);
  });

  it('allows a POST request with no Origin header (non-browser client, e.g. curl/server-to-server)', () => {
    expect(guard.canActivate(mockContext('POST', undefined))).toBe(true);
  });

  it('allows GET/HEAD/OPTIONS regardless of Origin — safe methods do not mutate state', () => {
    expect(guard.canActivate(mockContext('GET', 'http://evil.com'))).toBe(true);
    expect(guard.canActivate(mockContext('HEAD', 'http://evil.com'))).toBe(true);
    expect(guard.canActivate(mockContext('OPTIONS', 'http://evil.com'))).toBe(true);
  });

  it('rejects PUT/PATCH/DELETE with a mismatched Origin, not just POST', () => {
    expect(() => guard.canActivate(mockContext('PUT', 'http://evil.com'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(mockContext('PATCH', 'http://evil.com'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(mockContext('DELETE', 'http://evil.com'))).toThrow(ForbiddenException);
  });
});
