import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getAuthSessionCookieName } from '~/auth/auth.constants';
import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { InvalidSessionError } from '~/auth/errors/invalid-session.error';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

@Injectable()
export class OptionalSessionGuard implements CanActivate {
  private readonly logger = new Logger(OptionalSessionGuard.name);
  private readonly cookieName: string;

  constructor(
    configService: ConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {
    this.cookieName = getAuthSessionCookieName(
      configService.getOrThrow<boolean>('AUTH_COOKIE_SECURE'),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[this.cookieName];
    this.logger.log('OptionalSessionGuard -> canActivate -> params:', {
      params: {
        cookiePresent: typeof token === 'string',
        path: request.originalUrl,
      },
    });
    if (typeof token === 'string') {
      try {
        request.currentSession = await this.authSessionService.verifySession(
          token,
          'web',
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
      }
    }
    const result = true;
    this.logger.log('OptionalSessionGuard -> canActivate -> return:', {
      data: { activeSession: request.currentSession !== undefined },
    });
    return result;
  }
}
