import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthLoginResponseDto } from './dto/auth-response.dto';
import { UserEnvelopeDto } from '../users/dto/user-envelope.dto';
import { Public } from '../access-control/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../access-control/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login', operationId: 'authLogin' })
  @ApiOkResponse({ type: AuthLoginResponseDto }) // envelope, matches the wire
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user', operationId: 'authGetMe' })
  @ApiOkResponse({ type: UserEnvelopeDto }) // envelope, matches the wire
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user?.id);
  }
}
