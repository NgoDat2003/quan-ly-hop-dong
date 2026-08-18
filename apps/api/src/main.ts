// Must run before any other import that reads process.env at module-load
// time (e.g. PrismaService's constructor, which runs during Nest's DI
// container build, before ConfigModule.forRoot() has a chance to populate
// anything). @nestjs/config's ConfigModule only feeds ConfigService — it
// does not guarantee process.env itself is populated for code that reads
// process.env directly, so main.ts loads dotenv explicitly, the same way
// prisma.config.ts already does for CLI commands.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type LoggerService } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // Buffers Nest's internal logs (framework startup messages, module init)
  // until the pino Logger below is wired up, so nothing is lost or printed
  // through the default console logger mid-bootstrap.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get<LoggerService>(Logger));
  // Without this, PrismaService.onModuleDestroy never runs on SIGTERM —
  // the DB connection gets cut abruptly instead of closed cleanly when a
  // container orchestrator stops the process.
  app.enableShutdownHooks();
  // CSP disabled: Swagger UI (mounted at /api below) relies on inline
  // scripts/styles that helmet's default CSP blocks. All other helmet
  // headers (HSTS, X-Content-Type-Options, etc.) stay active.
  app.use(helmet({ contentSecurityPolicy: false }));
  // Required for JwtStrategy/AuthController to read the access/refresh
  // cookies off incoming requests — without this, request.cookies is
  // always undefined.
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Training App API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
