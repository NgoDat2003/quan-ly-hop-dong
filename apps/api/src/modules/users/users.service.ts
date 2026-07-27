import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {} // REAL: DI wiring

  // TODO: implement — prisma.user.findUnique({ where: { id } })
  async findById(_id: string): Promise<UserResponseDto | null> {
    return null;
  }

  // TODO: implement — prisma.user.findUnique({ where: { email } }), includes password hash
  async findByEmail(_email: string): Promise<unknown | null> {
    return null;
  }

  // TODO: implement — prisma.user.create(...). Kept as a signature slot for
  // whoever adds registration; no endpoint calls it in this base.
  async create(_data: { email: string; password: string; name: string }): Promise<UserResponseDto> {
    throw new Error('not implemented');
  }
}
