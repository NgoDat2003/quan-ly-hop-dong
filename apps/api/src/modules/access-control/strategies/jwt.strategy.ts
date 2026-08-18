import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { ACCESS_COOKIE_NAME } from '../constants/auth-cookie.constants';
import type { AuthUser } from '../decorators/current-user.decorator';

function extractAccessTokenFromCookie(req: Request): string | null {
  return req?.cookies?.[ACCESS_COOKIE_NAME] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    // REAL: passport-jwt throws at construction if secretOrKey is undefined,
    // which would crash Nest bootstrap. Fallback keeps a fresh clone booting
    // with no .env file present.
    super({
      jwtFromRequest: extractAccessTokenFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-placeholder-access-secret',
    });
  }

  async validate(payload: { sub?: string }): Promise<AuthUser> {
    const user = payload?.sub ? await this.usersService.findById(payload.sub) : null;
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
