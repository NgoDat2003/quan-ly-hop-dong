import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { validateEnv } from './config/env.schema';

@Module({
  imports: [
    // ConfigModule feeds ConfigService only — it does not guarantee
    // process.env itself is populated for code that reads process.env
    // directly (e.g. PrismaService). main.ts loads dotenv explicitly at
    // the top of the file for that reason; this validate callback still
    // runs against whatever process.env holds by the time this executes.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Registered before AccessControlModule on the assumption that
    // ThrottlerGuard (cheap, no DB/JWT work) then runs before
    // JwtAuthGuard/PermissionsGuard in the APP_GUARD chain. NestJS does
    // NOT document a guaranteed execution order for APP_GUARD providers
    // registered across different modules (only same-array @UseGuards()
    // decorators have a documented order) — re-verify this empirically
    // once JwtAuthGuard/PermissionsGuard hold real logic instead of their
    // current `return true` stubs, since a real PermissionsGuard reading
    // `request.user` would depend on JwtAuthGuard having run first.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AccessControlModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
