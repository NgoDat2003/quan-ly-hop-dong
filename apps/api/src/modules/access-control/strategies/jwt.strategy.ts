import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    // REAL: passport-jwt throws at construction if secretOrKey is undefined,
    // which would crash Nest bootstrap. Fallback keeps a fresh clone booting
    // with no .env file present.
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-placeholder-secret',
    });
  }

  // TODO: implement — look up the user by payload.sub via UsersService
  // and throw UnauthorizedException if absent.
  async validate(payload: { sub?: string }): Promise<AuthUser> {
    return {
      id: payload?.sub ?? 'stub-user-id',
      email: 'stub@example.com',
      role: 'ADMIN',
      name: 'Stub User',
    };
  }
}
