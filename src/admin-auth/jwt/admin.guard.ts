import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;

    if (!user?.sub || !user?.email) {
      throw new ForbiddenException('Acceso restringido a administradores');
    }

    return true;
  }
}
