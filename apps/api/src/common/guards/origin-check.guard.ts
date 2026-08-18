import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

// Minimal CSRF compensating control for cookie-based auth. Cookies are
// auto-attached by the browser to same-origin AND cross-origin requests,
// unlike the Authorization: Bearer header this app used before — that
// changeover removes a security property the app had "by default"
// (README used to document this). This guard restores a baseline: reject
// state-changing requests whose Origin header doesn't match WEB_ORIGIN.
// It is NOT a full double-submit CSRF token — SameSite=Strict/Lax on the
// cookies (set in AuthController) is the primary defense for same-site
// deploys; this is defense-in-depth for the case a browser's SameSite
// enforcement doesn't apply (e.g. some older browsers, or misconfigured
// SameSite=None deploys that forgot the CSRF token this app doesn't ship).
@Injectable()
export class OriginCheckGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Safe methods don't mutate state — no Origin check needed.
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return true;
    }

    const expectedOrigin = this.configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const origin = request.headers.origin;

    // Non-browser clients (curl, server-to-server, some native apps) don't
    // send an Origin header at all — this guard only protects against
    // browser-driven CSRF, so a missing Origin is not itself suspicious.
    if (!origin) {
      return true;
    }

    if (origin !== expectedOrigin) {
      throw new ForbiddenException('Origin not allowed');
    }

    return true;
  }
}
