import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { InvalidSessionError } from '~/auth/errors/invalid-session.error';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

@Injectable()
export class OptionalNativeSessionGuard implements CanActivate {
  private readonly logger = new Logger(OptionalNativeSessionGuard.name);

  constructor(private readonly authSessionService: AuthSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & AuthenticatedRequest>();
    const authorization = request.get('authorization');
    const token = /^Bearer ([^\s]+)$/.exec(authorization ?? '')?.[1];
    this.logger.log('OptionalNativeSessionGuard -> canActivate -> params:', {
      params: {
        authorizationPresent: typeof authorization === 'string',
        bearerWellFormed: token !== undefined,
        path: request.originalUrl,
      },
    });

    if (token !== undefined) {
      try {
        request.currentSession = await this.authSessionService.verifySession(
          token,
          'native',
        );
      } catch (error: unknown) {
        if (error instanceof RedisUnavailableError) {
          throw new ServiceUnavailableException({
            code: 'AUTHENTICATION_UNAVAILABLE',
            details: {},
            message: 'Authentication is temporarily unavailable.',
          });
        }
        if (!(error instanceof InvalidSessionError)) {
          throw error;
        }
        this.logger.log(
          'OptionalNativeSessionGuard -> canActivate -> inactiveSession branch:',
          { data: { activeSession: false } },
        );
      }
    }

    const result = true;
    this.logger.log('OptionalNativeSessionGuard -> canActivate -> return:', {
      data: { activeSession: request.currentSession !== undefined },
    });
    return result;
  }
}
