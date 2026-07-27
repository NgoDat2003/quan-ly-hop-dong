import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  // TODO: implement — check PUBLIC_KEY metadata via this.reflector,
  // then delegate to super.canActivate(context) for non-public routes.
  // Currently allows ALL requests through, authenticated or not.
  canActivate(_context: ExecutionContext) {
    return true;
  }
}
