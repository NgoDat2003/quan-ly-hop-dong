import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserResponseDto } from './dto/user-response.dto';
import type { User } from '../../generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {} // REAL: DI wiring

  async findById(id: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  }

  // Returns the raw Prisma User (includes password hash) — internal use by
  // AuthService only, never serialize this directly into an API response.
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // TODO: implement — prisma.user.create(...). Kept as a signature slot for
  // whoever adds registration; no endpoint calls it in this base.
  async create(_data: { email: string; password: string; name: string }): Promise<UserResponseDto> {
    throw new Error('not implemented');
  }
}
