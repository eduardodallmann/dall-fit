import { timingSafeEqual } from 'node:crypto';

import {
  ForbiddenException,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { CSRF_HEADER } from '~/auth/auth.constants';
import type { AuthenticatedRequest } from '~/auth/domain/auth.types';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);
  private readonly expectedOrigin: string;

  constructor(configService: ConfigService) {
    this.expectedOrigin = new URL(
      configService.getOrThrow<string>('UI_URL'),
    ).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & AuthenticatedRequest>();
    const session = request.currentSession;
    const origin = request.get('origin');
    const csrfToken = request.get(CSRF_HEADER);
    this.logger.log('CsrfGuard -> canActivate -> params:', {
      params: {
        csrfTokenPresent: typeof csrfToken === 'string',
        originPresent: typeof origin === 'string',
        path: request.originalUrl,
        sessionChannel: session?.channel,
        sessionLoaded: session !== undefined,
      },
    });

    if (session?.channel === 'native') {
      this.logger.log('CsrfGuard -> canActivate -> nativeSession branch:', {
        data: { csrfRequired: false },
      });
      const result = true;
      this.logger.log('CsrfGuard -> canActivate -> return:', {
        data: { allowed: result },
      });
      return result;
    }

    const allowed =
      session !== undefined &&
      origin === this.expectedOrigin &&
      typeof csrfToken === 'string' &&
      constantTimeMatches(csrfToken, session.csrfToken);

    if (!allowed) {
      this.logger.warn('CsrfGuard -> canActivate -> rejected branch:', {
        data: { code: 'CSRF_VALIDATION_FAILED' },
      });
      throw new ForbiddenException({
        code: 'CSRF_VALIDATION_FAILED',
        details: {},
        message: 'Request origin or CSRF token is invalid.',
      });
    }

    const result = true;
    this.logger.log('CsrfGuard -> canActivate -> return:', {
      data: { allowed: result },
    });

    return result;
  }
}

function constantTimeMatches(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  const result =
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer);

  return result;
}
