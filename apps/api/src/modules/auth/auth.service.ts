import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcryptjs from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { AuthResultDto } from './dto/auth-result.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import type { User } from '../../generated/prisma/client';

// Fixed dummy hash used only to keep bcryptjs.compare's timing constant when
// no user is found — prevents timing-based email enumeration on login.
// Not a real credential; never use as an actual account password.
const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8/pkFN5ZP/kD.EPZUJ4kBw7WgXTvVe';

function toUserResponseDto(user: User): UserResponseDto {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // Returns the INNER shape only; TransformInterceptor adds { statusCode, data }.
  async login(dto: LoginDto): Promise<AuthResultDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await bcryptjs.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid email or password');
    }
    const passwordMatches = await bcryptjs.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    return { accessToken, user: toUserResponseDto(user) };
  }

  async me(userId: string | undefined): Promise<UserResponseDto> {
    if (!userId) throw new UnauthorizedException();
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
