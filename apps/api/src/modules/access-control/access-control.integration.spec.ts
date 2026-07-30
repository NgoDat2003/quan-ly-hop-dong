import { Controller, ForbiddenException, Get, INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessControlModule } from './access-control.module';
import { Public } from './decorators/public.decorator';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { validateEnv } from '../../config/env.schema';

@Controller('test')
class TestController {
  @Get('protected')
  protectedRoute() {
    return { ok: true };
  }

  @Get('public')
  @Public()
  publicRoute() {
    return { ok: true };
  }

  @Get('permission')
  @RequirePermissions('some:action')
  permissionRoute() {
    return { ok: true };
  }

  @Get('public-and-permission')
  @Public()
  @RequirePermissions('some:action')
  publicAndPermissionRoute() {
    return { ok: true };
  }
}

describe('Access control (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const findById = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), AccessControlModule],
      controllers: [TestController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UsersService)
      .useValue({ findById })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findById.mockReset();
  });

  it('rejects request with no Authorization header (401)', async () => {
    await request(app.getHttpServer()).get('/test/protected').expect(401);
  });

  it('rejects request with malformed JWT (401)', async () => {
    await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);
  });

  it('rejects valid JWT when payload.sub does not map to a user in the DB (401) — proves JwtStrategy no longer trusts any token', async () => {
    findById.mockResolvedValue(null);
    const token = await jwtService.signAsync({ sub: 'nonexistent-id' });
    await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('accepts valid JWT for a found user, request.user reflects the real role (not hardcoded ADMIN)', async () => {
    findById.mockResolvedValue({ id: 'user-1', email: 'trainee@example.com', name: 'Trainee', role: 'TRAINEE' });
    const token = await jwtService.signAsync({ sub: 'user-1' });
    await request(app.getHttpServer())
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('bypasses guard entirely for @Public() route, no token required', async () => {
    await request(app.getHttpServer()).get('/test/public').expect(200);
  });

  it('rejects TRAINEE (no granted permissions) on a @RequirePermissions route (403)', async () => {
    findById.mockResolvedValue({ id: 'user-1', email: 'trainee@example.com', name: 'Trainee', role: 'TRAINEE' });
    const token = await jwtService.signAsync({ sub: 'user-1' });
    await request(app.getHttpServer())
      .get('/test/permission')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('accepts ADMIN (wildcard permission) on a @RequirePermissions route (200) — proves request.user is set before PermissionsGuard runs, verifying cross-module guard order', async () => {
    findById.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' });
    const token = await jwtService.signAsync({ sub: 'admin-1' });
    await request(app.getHttpServer())
      .get('/test/permission')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('bypasses a route with both @Public() and @RequirePermissions() (no 401, no 403, no crash on undefined request.user)', async () => {
    await request(app.getHttpServer()).get('/test/public-and-permission').expect(200);
  });
});
