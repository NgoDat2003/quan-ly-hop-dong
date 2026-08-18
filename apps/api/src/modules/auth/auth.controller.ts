import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { minutes, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, type TokenBundle } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthLoginResponseDto } from './dto/auth-response.dto';
import { UserEnvelopeDto } from '../users/dto/user-envelope.dto';
import { SuccessResponseDto } from '../../common/dto/success-response.dto';
import { Public } from '../access-control/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../access-control/decorators/current-user.decorator';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from '../access-control/constants/auth-cookie.constants';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @ApiOperation({ summary: 'Login', operationId: 'authLogin' })
  @ApiOkResponse({ type: AuthLoginResponseDto }) // envelope, matches the wire
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { user, tokens } = await this.authService.login(dto);
    this.applyAuthCookies(response, tokens);
    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @ApiOperation({ summary: 'Refresh access token', operationId: 'authRefresh' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const tokens = await this.authService.refresh(refreshToken);
    this.applyAuthCookies(response, tokens);
    return { success: true };
  }

  // @Public() deliberately: logout must work even when the access token has
  // already expired (the common case — a user closing a stale tab). It
  // authenticates itself via the refresh cookie inside AuthService.logout,
  // same pattern as /auth/refresh.
  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout current session', operationId: 'authLogout' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await this.authService.logout(refreshToken);
    this.clearAuthCookies(response);
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user', operationId: 'authGetMe' })
  @ApiOkResponse({ type: UserEnvelopeDto }) // envelope, matches the wire
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user?.id);
  }

  private applyAuthCookies(response: Response, tokens: TokenBundle): void {
    const secure = this.configService.get<boolean>('AUTH_COOKIE_SECURE') ?? false;

    response.cookie(ACCESS_COOKIE_NAME, tokens.accessToken, {
      httpOnly: true,
      maxAge: tokens.accessTokenExpiresInMs,
      path: '/',
      sameSite: 'lax',
      secure,
    });

    response.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      maxAge: tokens.refreshTokenExpiresInMs,
      path: REFRESH_COOKIE_PATH,
      sameSite: 'strict',
      secure,
    });
  }

  private clearAuthCookies(response: Response): void {
    response.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
    response.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }
}
