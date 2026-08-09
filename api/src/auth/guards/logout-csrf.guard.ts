import {
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { CsrfGuard } from '~/auth/guards/csrf.guard';

@Injectable()
export class LogoutCsrfGuard implements CanActivate {
  private readonly logger = new Logger(LogoutCsrfGuard.name);

  constructor(private readonly csrfGuard: CsrfGuard) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    this.logger.log('LogoutCsrfGuard -> canActivate -> params:', {
      params: { activeSession: request.currentSession !== undefined },
    });
    const result =
      request.currentSession === undefined ||
      this.csrfGuard.canActivate(context);
    this.logger.log('LogoutCsrfGuard -> canActivate -> return:', {
      data: { allowed: result },
    });
    return result;
  }
}
