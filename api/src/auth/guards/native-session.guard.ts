import {
  ForbiddenException,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedRequest } from '~/auth/domain/auth.types';

@Injectable()
export class NativeSessionGuard implements CanActivate {
  private readonly logger = new Logger(NativeSessionGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & AuthenticatedRequest>();
    const native = request.currentSession?.channel === 'native';
    this.logger.log('NativeSessionGuard -> canActivate -> params:', {
      params: { sessionLoaded: request.currentSession !== undefined },
    });

    if (!native) {
      this.logger.warn(
        'NativeSessionGuard -> canActivate -> nativeSessionRequired error:',
        { data: { code: 'NATIVE_SESSION_REQUIRED' } },
      );
      throw new ForbiddenException({
        code: 'NATIVE_SESSION_REQUIRED',
        details: {},
        message: 'A native session is required.',
      });
    }

    const result = true;
    this.logger.log('NativeSessionGuard -> canActivate -> return:', {
      data: { allowed: result },
    });
    return result;
  }
}
