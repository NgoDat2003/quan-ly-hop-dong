import { UnauthorizedException } from '@nestjs/common';
import * as bcryptjs from 'bcryptjs';
import { AuthService } from './auth.service';
import { Role } from '../../generated/prisma/enums';

describe('AuthService', () => {
  const usersService = { findByEmail: jest.fn(), findById: jest.fn() };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };

  const service = new AuthService(usersService as never, jwtService as never);

  beforeEach(() => {
    usersService.findByEmail.mockReset();
    usersService.findById.mockReset();
    jwtService.signAsync.mockClear();
  });

  describe('login', () => {
    it('rejects with a generic message when the email does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.login({ email: 'nobody@example.com', password: 'password123' })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });

    it('rejects with the SAME generic message when the password is wrong (does not distinguish from unknown-email)', async () => {
      const hash = await bcryptjs.hash('correct-password', 4);
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

    it('returns an access token and a password-free user on success', async () => {
      const hash = await bcryptjs.hash('correct-password', 4);
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        role: Role.TRAINEE,
        password: hash,
      });
      const result = await service.login({ email: 'user@example.com', password: 'correct-password' });
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        user: { id: 'user-1', email: 'user@example.com', name: 'User', role: Role.TRAINEE },
      });
      expect(result.user).not.toHaveProperty('password');
      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 'user-1' });
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
});
