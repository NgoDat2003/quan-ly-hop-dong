import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  // TODO: implement — read REQUIRE_PERMISSIONS_KEY metadata, resolve the
  // request user's role, call hasPermission(), throw ForbiddenException.
  // Currently allows ALL requests.
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
