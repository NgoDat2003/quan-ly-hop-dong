import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { AuthResultDto } from './dto/auth-result.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Role } from '../../generated/prisma/enums';

// TODO: remove when implemented
const STUB_USER: UserResponseDto = {
  id: 'stub-user-id',
  email: 'stub@example.com',
  name: 'Stub User',
  role: Role.ADMIN,
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // TODO: implement — findByEmail, bcrypt.compare, jwtService.signAsync.
  // Returns the INNER shape only; TransformInterceptor adds { statusCode, data }.
  async login(_dto: LoginDto): Promise<AuthResultDto> {
    return { accessToken: 'stub-token', user: STUB_USER };
  }

  // TODO: implement — usersService.findById(userId), throw if absent.
  async me(_userId: string | undefined): Promise<UserResponseDto> {
    return STUB_USER;
  }
}
