import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { AuthSessionsService } from '../auth-sessions/auth-sessions.service';
import { LoginDto } from './dto/login.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import type { User } from '../../generated/prisma/client';

// Fixed dummy hash used only to keep argon2.verify's timing constant when
// no user is found — prevents timing-based email enumeration on login.
// Not a real credential; never use as an actual account password.
// MUST be hashed with the exact same ARGON2_OPTIONS as every real
// argon2.hash call below, or verify timing diverges between the "unknown
// email" and "wrong password" branches, reopening the enumeration gap this
// exists to close.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$vl+BkoN8IzH+EXCTu8UvHg$FHrw90klZiYQIZoDKJIDzqArrwIJ1PRYj7CnxvYZ6xc';

// TTL string -> ms, used to compute the Max-Age of the cookies the
// controller sets. Only supports the unit suffixes @nestjs/jwt's expiresIn
// accepts that this codebase actually configures (s/m/h/d) — not a
// general-purpose duration parser.
function ttlToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported TTL format: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return amount * unitMs;
}

export type TokenBundle = {
  accessToken: string;
  accessTokenExpiresInMs: number;
  refreshToken: string;
  refreshTokenExpiresInMs: number;
};

type RefreshTokenPayload = {
  sid: string;
  sub: string;
};

function toUserResponseDto(user: User): UserResponseDto {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authSessionsService: AuthSessionsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Returns { user, tokens } — the controller sends `user` in the response
  // body and uses `tokens` to set cookies. Never return `tokens` directly
  // from a controller method: TransformInterceptor would serialize it into
  // the JSON body, defeating the point of cookie-only delivery.
  async login(dto: LoginDto): Promise<{ user: UserResponseDto; tokens: TokenBundle }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await argon2.verify(DUMMY_HASH, dto.password);
      throw new UnauthorizedException('Invalid email or password');
    }
    const passwordMatches = await argon2.verify(user.password, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.createSessionAndTokens(user.id);
    return { user: toUserResponseDto(user), tokens };
  }

  async me(userId: string | undefined): Promise<UserResponseDto> {
    if (!userId) throw new UnauthorizedException();
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async refresh(rawRefreshToken: string | undefined): Promise<TokenBundle> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException();
    }

    const payload = await this.verifyRefreshToken(rawRefreshToken);
    const session = await this.authSessionsService.getActiveSessionOrThrow(payload.sid);

    if (session.userId !== payload.sub) {
      throw new UnauthorizedException();
    }

    const hashMatches = await argon2.verify(session.refreshTokenHash, rawRefreshToken);
    if (!hashMatches) {
      // The token's signature and session are valid, but the hash doesn't
      // match the session's current one — this is exactly what happens
      // when an old, already-rotated refresh token gets replayed (its
      // signature stays valid until the JWT's own exp, even after
      // rotation swaps the hash in the DB). Treat the whole token family
      // as compromised, not just this one session.
      await this.authSessionsService.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException();
    }

    const tokens = await this.issueTokenBundle(payload.sub, payload.sid);
    const newHash = await argon2.hash(tokens.refreshToken);
    const newExpiresAt = new Date(Date.now() + tokens.refreshTokenExpiresInMs);

    const rotatedCount = await this.authSessionsService.rotateSessionAtomic(
      payload.sid,
      session.refreshTokenHash,
      newHash,
      newExpiresAt,
    );

    if (rotatedCount === 1) {
      return tokens;
    }

    // rotatedCount === 0: another concurrent refresh call already rotated
    // this session between our read and our write (e.g. two parallel
    // requests firing right as the access token expired). Re-read the
    // session: if the current hash was produced from OUR rawRefreshToken
    // (i.e. some other request racing on the exact same token won and
    // rotated it just now), this is a benign race, not theft — don't
    // revoke. 409 (not 401) so the caller can distinguish "retry me" from
    // "you're logged out."
    const latest = await this.authSessionsService.getActiveSessionOrThrow(payload.sid);
    const raceIsBenign = await argon2.verify(latest.refreshTokenHash, rawRefreshToken).catch(() => false);
    if (raceIsBenign) {
      throw new ConflictException('Session was just refreshed by a concurrent request, retry');
    }

    // Hash changed to something NOT derived from our token and NOT what we
    // read moments ago — something other than a same-token race happened
    // (e.g. the session was rotated by a different, unrelated refresh
    // token attempt in between our read and this recheck). Treat as
    // suspicious the same way a straight hash mismatch is treated above.
    await this.authSessionsService.revokeAllUserSessions(session.userId);
    throw new UnauthorizedException();
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    try {
      const payload = await this.verifyRefreshToken(rawRefreshToken);
      await this.authSessionsService.revokeSession(payload.sid);
    } catch {
      // Best-effort: logout always "succeeds" from the client's
      // perspective even if the refresh token is missing/invalid/expired.
    }
  }

  private async createSessionAndTokens(userId: string): Promise<TokenBundle> {
    const sessionId = randomUUID();
    const tokens = await this.issueTokenBundle(userId, sessionId);
    const refreshTokenHash = await argon2.hash(tokens.refreshToken);

    await this.authSessionsService.createSession({
      id: sessionId,
      userId,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + tokens.refreshTokenExpiresInMs),
    });

    return tokens;
  }

  private async issueTokenBundle(userId: string, sessionId: string): Promise<TokenBundle> {
    const accessTtl = this.configService.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TTL') ?? '7d';
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'dev-placeholder-refresh-secret';

    const accessToken = await this.jwtService.signAsync(
      { sub: userId },
      { expiresIn: accessTtl } as JwtSignOptions,
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, sid: sessionId },
      { expiresIn: refreshTtl, secret: refreshSecret } as JwtSignOptions,
    );

    return {
      accessToken,
      accessTokenExpiresInMs: ttlToMs(accessTtl),
      refreshToken,
      refreshTokenExpiresInMs: ttlToMs(refreshTtl),
    };
  }

  private async verifyRefreshToken(rawRefreshToken: string): Promise<RefreshTokenPayload> {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'dev-placeholder-refresh-secret';
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(rawRefreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException();
    }
  }
}
