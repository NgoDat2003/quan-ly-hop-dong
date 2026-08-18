// Must run before PrismaService is constructed below — PrismaService reads
// process.env.DATABASE_URL directly at construction time, and this test
// file (unlike main.ts) has no other entry point that loads .env first.
import 'dotenv/config';
import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthSessionsService } from './auth-sessions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';

// Real Prisma against the local dev Postgres (docker compose up -d) — the
// compare-and-swap logic in rotateSessionAtomic lives entirely in the SQL
// WHERE clause, so a mocked PrismaService can't prove it actually works.
// This test needs the DB from `docker compose up -d` to be running.
describe('AuthSessionsService (integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const service = new AuthSessionsService(prisma);
  let userId: string;

  beforeAll(async () => {
    await prisma.onModuleInit();
    const user = await prisma.user.create({
      data: {
        email: `auth-sessions-test-${randomUUID()}@example.com`,
        password: 'irrelevant-for-this-test',
        name: 'Auth Sessions Test User',
        role: Role.TRAINEE,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.authSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.onModuleDestroy();
  });

  async function createTestSession(hash: string) {
    const sessionId = randomUUID();
    return service.createSession({
      id: sessionId,
      userId,
      refreshTokenHash: hash,
      expiresAt: new Date(Date.now() + 100_000),
    });
  }

  it('rotateSessionAtomic succeeds on the first call and updates the hash', async () => {
    const session = await createTestSession('hash-v1');
    const newExpiresAt = new Date(Date.now() + 200_000);

    const count = await service.rotateSessionAtomic(session.id, 'hash-v1', 'hash-v2', newExpiresAt);

    expect(count).toBe(1);
    const reloaded = await service.getActiveSessionOrThrow(session.id);
    expect(reloaded.refreshTokenHash).toBe('hash-v2');
  });

  it('rotateSessionAtomic returns 0 on a second call with the now-stale hash — proves the CAS actually happened in SQL, not just in application memory', async () => {
    const session = await createTestSession('hash-v1');
    const newExpiresAt = new Date(Date.now() + 200_000);

    const firstCall = await service.rotateSessionAtomic(session.id, 'hash-v1', 'hash-v2', newExpiresAt);
    expect(firstCall).toBe(1);

    // Second call still presents the OLD hash (hash-v1) — simulates a
    // concurrent request that read the session before the first rotation
    // committed. The WHERE clause (refreshTokenHash = 'hash-v1') no longer
    // matches any row, so this must return 0, not silently overwrite
    // hash-v2 with a third value.
    const secondCall = await service.rotateSessionAtomic(session.id, 'hash-v1', 'hash-v3', newExpiresAt);
    expect(secondCall).toBe(0);

    const reloaded = await service.getActiveSessionOrThrow(session.id);
    expect(reloaded.refreshTokenHash).toBe('hash-v2'); // NOT hash-v3 — second call's write never landed
  });

  it('rotateSessionAtomic returns 0 when the session has been revoked, even with the correct hash', async () => {
    const session = await createTestSession('hash-v1');
    await service.revokeSession(session.id);

    const count = await service.rotateSessionAtomic(session.id, 'hash-v1', 'hash-v2', new Date(Date.now() + 200_000));

    expect(count).toBe(0);
  });

  it('getActiveSessionOrThrow throws for a revoked session', async () => {
    const session = await createTestSession('hash-v1');
    await service.revokeSession(session.id);

    await expect(service.getActiveSessionOrThrow(session.id)).rejects.toThrow(UnauthorizedException);
  });

  it('getActiveSessionOrThrow throws for an expired session', async () => {
    const sessionId = randomUUID();
    await service.createSession({
      id: sessionId,
      userId,
      refreshTokenHash: 'hash-v1',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(service.getActiveSessionOrThrow(sessionId)).rejects.toThrow(UnauthorizedException);
  });

  it('revokeAllUserSessions revokes every active session for the user but leaves other users untouched', async () => {
    const sessionA = await createTestSession('hash-a');
    const sessionB = await createTestSession('hash-b');

    const otherUser = await prisma.user.create({
      data: {
        email: `auth-sessions-test-other-${randomUUID()}@example.com`,
        password: 'irrelevant',
        name: 'Other User',
        role: Role.TRAINEE,
      },
    });
    const otherSessionId = randomUUID();
    await prisma.authSession.create({
      data: {
        id: otherSessionId,
        userId: otherUser.id,
        refreshTokenHash: 'hash-other',
        expiresAt: new Date(Date.now() + 100_000),
      },
    });

    await service.revokeAllUserSessions(userId);

    await expect(service.getActiveSessionOrThrow(sessionA.id)).rejects.toThrow(UnauthorizedException);
    await expect(service.getActiveSessionOrThrow(sessionB.id)).rejects.toThrow(UnauthorizedException);
    // Other user's session must survive — revokeAllUserSessions is scoped
    // by userId, not global.
    await expect(service.getActiveSessionOrThrow(otherSessionId)).resolves.toBeDefined();

    await prisma.authSession.deleteMany({ where: { userId: otherUser.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });
});
