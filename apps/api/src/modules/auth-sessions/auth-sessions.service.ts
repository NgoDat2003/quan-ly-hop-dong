import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthSession } from '../../generated/prisma/client';

@Injectable()
export class AuthSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // `id` is passed in (not left to Prisma's default cuid()) so the caller
  // can sign the refresh JWT's `sid` claim with the same id the row will
  // have, in one pass — no second write needed to backfill it.
  async createSession(input: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AuthSession> {
    return this.prisma.authSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async getActiveSessionOrThrow(sessionId: string): Promise<AuthSession> {
    const session = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }
    return session;
  }

  // Compare-and-swap rotate: the WHERE clause only matches if refreshTokenHash
  // still equals oldHash, so concurrent refresh calls racing on the same
  // token can't both "win" — the second one gets count: 0 instead of
  // silently overwriting the first rotation. Callers use the count to tell
  // a benign race (another request already rotated) apart from a real
  // replay (an old, already-rotated token being reused).
  async rotateSessionAtomic(
    sessionId: string,
    oldHash: string,
    newHash: string,
    newExpiresAt: Date,
  ): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, refreshTokenHash: oldHash, revokedAt: null },
      data: { refreshTokenHash: newHash, expiresAt: newExpiresAt, lastUsedAt: new Date() },
    });
    return result.count;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
