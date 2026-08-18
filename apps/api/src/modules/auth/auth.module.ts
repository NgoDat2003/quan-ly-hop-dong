import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthSessionsModule } from '../auth-sessions/auth-sessions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule, AuthSessionsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
