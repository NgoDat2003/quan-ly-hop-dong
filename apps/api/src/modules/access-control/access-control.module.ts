import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  imports: [
    PassportModule,
    UsersModule,
    // Registers the ACCESS token secret as the module-wide default — kept
    // (not removed) specifically so JwtStrategy and access-control.
    // integration.spec.ts's DI-injected JwtService keep working unchanged.
    // Refresh tokens use a different secret, passed per-call via
    // JwtSignOptions.secret in AuthService (see issueTokenBundle /
    // verifyRefreshToken) — they deliberately do NOT use this default.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService): JwtModuleOptions => ({
        secret: c.get<string>('JWT_ACCESS_SECRET') ?? 'dev-placeholder-access-secret',
        signOptions: {
          expiresIn: c.get<string>('JWT_ACCESS_TTL') ?? '15m',
        } as JwtModuleOptions['signOptions'],
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // runs first
    { provide: APP_GUARD, useClass: PermissionsGuard }, // runs second
  ],
  exports: [JwtModule],
})
export class AccessControlModule {}
