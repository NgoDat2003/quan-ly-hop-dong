import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { Role } from '../../generated/prisma/enums';
import { ARGON2_OPTIONS } from './argon2-options.constant';

describe('AuthService', () => {
  const usersService = { findByEmail: jest.fn(), findById: jest.fn() };
  const authSessionsService = {
    createSession: jest.fn(),
    getActiveSessionOrThrow: jest.fn(),
    rotateSessionAtomic: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllUserSessions: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-jwt'),
    verifyAsync: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
      };
      return values[key];
    }),
  };

  const service = new AuthService(
    usersService as never,
    authSessionsService as never,
    jwtService as never,
    configService as never,
  );

  beforeEach(() => {
    usersService.findByEmail.mockReset();
    usersService.findById.mockReset();
    authSessionsService.createSession.mockReset();
    authSessionsService.getActiveSessionOrThrow.mockReset();
    authSessionsService.rotateSessionAtomic.mockReset();
    authSessionsService.revokeSession.mockReset();
    authSessionsService.revokeAllUserSessions.mockReset();
    jwtService.signAsync.mockClear().mockResolvedValue('signed-jwt');
    jwtService.verifyAsync.mockReset();
  });

  describe('login', () => {
    it('rejects with a generic message when the email does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.login({ email: 'nobody@example.com', password: 'password123' })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });

    it('rejects with the SAME generic message when the password is wrong (does not distinguish from unknown-email)', async () => {
      const hash = await argon2.hash('correct-password', ARGON2_OPTIONS);
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        role: Role.TRAINEE,
        password: hash,
      });
      await expect(service.login({ email: 'user@example.com', password: 'wrong-password' })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });

    it('returns a password-free user and a token bundle on success', async () => {
      const hash = await argon2.hash('correct-password', ARGON2_OPTIONS);
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        role: Role.TRAINEE,
        password: hash,
      });
      authSessionsService.createSession.mockResolvedValue({});

      const result = await service.login({ email: 'user@example.com', password: 'correct-password' });

      expect(result.user).toEqual({ id: 'user-1', email: 'user@example.com', name: 'User', role: Role.TRAINEE });
      expect(result.user).not.toHaveProperty('password');
      expect(result.tokens.accessToken).toBe('signed-jwt');
      expect(result.tokens.refreshToken).toBe('signed-jwt');
      expect(authSessionsService.createSession).toHaveBeenCalledTimes(1);
      expect(authSessionsService.createSession.mock.calls[0][0]).toMatchObject({ userId: 'user-1' });
    });
  });

  describe('me', () => {
    it('throws when the user is not found in the DB', async () => {
      usersService.findById.mockResolvedValue(null);
      await expect(service.me('some-id')).rejects.toThrow(UnauthorizedException);
    });

    it('throws when userId is undefined', async () => {
      await expect(service.me(undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('returns the real user when found', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        role: Role.TRAINEE,
      });
      await expect(service.me('user-1')).resolves.toEqual({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        role: Role.TRAINEE,
      });
    });
  });

  describe('refresh', () => {
    it('rejects when no refresh token is provided', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('rotates and returns a new token bundle when the refresh token is valid and CAS succeeds', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', sid: 'session-1' });
      const currentHash = await argon2.hash('raw-refresh-token', ARGON2_OPTIONS);
      authSessionsService.getActiveSessionOrThrow.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: currentHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });
      authSessionsService.rotateSessionAtomic.mockResolvedValue(1);

      const result = await service.refresh('raw-refresh-token');

      expect(result.accessToken).toBe('signed-jwt');
      expect(authSessionsService.rotateSessionAtomic).toHaveBeenCalledWith(
        'session-1',
        currentHash,
        expect.any(String),
        expect.any(Date),
      );
      expect(authSessionsService.revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it('propagates 401 when the session does not exist or is already revoked', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', sid: 'session-1' });
      authSessionsService.getActiveSessionOrThrow.mockRejectedValue(new UnauthorizedException());

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the ENTIRE session family (not just one session) when the hash does not match — replay detection', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', sid: 'session-1' });
      const differentHash = await argon2.hash('a-different-token', ARGON2_OPTIONS);
      authSessionsService.getActiveSessionOrThrow.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: differentHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(UnauthorizedException);
      expect(authSessionsService.revokeAllUserSessions).toHaveBeenCalledWith('user-1');
      expect(authSessionsService.rotateSessionAtomic).not.toHaveBeenCalled();
    });

    it('returns 409 (not 401) when CAS reports a benign race (count 0) and the current hash was produced from the same token — concurrent refresh must not punish the user', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', sid: 'session-1' });
      const currentHash = await argon2.hash('raw-refresh-token', ARGON2_OPTIONS);
      const winningHash = await argon2.hash('raw-refresh-token', ARGON2_OPTIONS); // different salt, same input token
      authSessionsService.getActiveSessionOrThrow
        .mockResolvedValueOnce({
          id: 'session-1',
          userId: 'user-1',
          refreshTokenHash: currentHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100_000),
        })
        // Re-read after the CAS race: another request already rotated using
        // the SAME rawRefreshToken we're holding — hash differs (fresh salt)
        // but still verifies against our token.
        .mockResolvedValueOnce({
          id: 'session-1',
          userId: 'user-1',
          refreshTokenHash: winningHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100_000),
        });
      authSessionsService.rotateSessionAtomic.mockResolvedValue(0);

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(ConflictException);
      expect(authSessionsService.revokeSession).not.toHaveBeenCalled();
      expect(authSessionsService.revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it('revokes the ENTIRE session family when CAS reports count 0 but the re-read hash does NOT verify against our token — not a same-token race', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', sid: 'session-1' });
      const currentHash = await argon2.hash('raw-refresh-token', ARGON2_OPTIONS);
      const unrelatedHash = await argon2.hash('a-completely-different-token', ARGON2_OPTIONS);
      authSessionsService.getActiveSessionOrThrow
        .mockResolvedValueOnce({
          id: 'session-1',
          userId: 'user-1',
          refreshTokenHash: currentHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100_000),
        })
        .mockResolvedValueOnce({
          id: 'session-1',
          userId: 'user-1',
          refreshTokenHash: unrelatedHash,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100_000),
        });
      authSessionsService.rotateSessionAtomic.mockResolvedValue(0);

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(UnauthorizedException);
      expect(authSessionsService.revokeAllUserSessions).toHaveBeenCalledWith('user-1');
    });
  });

  describe('logout', () => {
    it('revokes the session tied to a valid refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', sid: 'session-1' });
      await service.logout('raw-refresh-token');
      expect(authSessionsService.revokeSession).toHaveBeenCalledWith('session-1');
    });

    it('does not throw and does not call revokeSession when the token is missing', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(authSessionsService.revokeSession).not.toHaveBeenCalled();
    });

    it('does not throw when the token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      await expect(service.logout('garbage-token')).resolves.toBeUndefined();
      expect(authSessionsService.revokeSession).not.toHaveBeenCalled();
    });
  });
});
