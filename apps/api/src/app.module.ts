import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    PrismaModule,
    AccessControlModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
