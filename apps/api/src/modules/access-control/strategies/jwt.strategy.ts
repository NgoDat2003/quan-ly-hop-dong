import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import type { AuthUser } from '../decorators/current-user.decorator';

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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-placeholder-secret',
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
