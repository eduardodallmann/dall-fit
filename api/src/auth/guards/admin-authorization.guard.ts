import {
  ForbiddenException,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '~/auth/domain/auth.types';

@Injectable()
export class AdminAuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AdminAuthorizationGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const person = request.currentPerson;

    this.logger.log('AdminAuthorizationGuard -> canActivate -> params:', {
      params: {
        personLoaded: person !== undefined,
        path: request.originalUrl,
      },
    });

    if (person === undefined) {
      this.logger.error(
        'AdminAuthorizationGuard -> canActivate -> missingAuthenticatedPerson error:',
        { data: { configurationError: true } },
      );
      throw new Error(
        'AdminAuthorizationGuard requires SessionAuthGuard to run first.',
      );
    }

    if (person.isAdmin !== true) {
      this.logger.warn(
        'AdminAuthorizationGuard -> canActivate -> adminAccessRequired error:',
        {
          data: {
            code: 'ADMIN_ACCESS_REQUIRED',
            personId: person.id,
          },
        },
      );
      throw new ForbiddenException({
        code: 'ADMIN_ACCESS_REQUIRED',
        details: {},
        message: 'Administrator access is required.',
      });
    }

    const result = true;
    this.logger.log('AdminAuthorizationGuard -> canActivate -> return:', {
      data: { isAdmin: true, personId: person.id },
    });

    return result;
  }
}
