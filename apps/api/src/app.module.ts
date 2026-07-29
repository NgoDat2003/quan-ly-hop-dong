import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { validateEnv, type AppEnv } from './config/env.schema';

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
    // JSON structured request logging via pino, replacing Nest's default
    // text logger. redact strips Authorization headers so JWT bearer
    // tokens never land in log output/aggregators.
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppEnv, true>) => {
        const nodeEnv = configService.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: nodeEnv === 'production' ? 'info' : 'debug',
            // pino-http does not log req.body by default, so login
            // payloads aren't exposed even without an explicit redact
            // entry for them. If a future change adds a req.body
            // serializer (e.g. for debugging), extend this redact list
            // to cover credential fields in the body too.
            redact: ['req.headers.authorization'],
            transport:
              nodeEnv === 'production'
                ? undefined
                : {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      ignore: 'pid,hostname',
                      singleLine: false,
                      translateTime: 'SYS:standard',
                    },
                  },
          },
          // Nest 10 (Express adapter, path-to-regexp v6) route wildcard —
          // NOT the '{*path}' syntax from Nest 11/path-to-regexp v8.
          // '{*path}' silently fails to match any route on this Nest
          // version: no error at boot or build time, the middleware
          // simply never runs. Verified against a live request during
          // implementation — '*' is the correct pattern here.
          forRoutes: [{ path: '*', method: RequestMethod.ALL }],
        };
      },
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
