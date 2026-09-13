import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { getAuthSessionCookieName } from '~/auth/auth.constants';
import type {
  AuthenticatedRequest,
  SessionChannel,
  VerifiedSession,
} from '~/auth/domain/auth.types';
import { InvalidSessionError } from '~/auth/errors/invalid-session.error';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { FindPersonByIdService } from '~/person/services/find-person-by-id.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);
  private readonly cookieName: string;

  constructor(
    configService: ConfigService,
    private readonly authSessionService: AuthSessionService,
    private readonly findPersonByIdService: FindPersonByIdService,
  ) {
    this.cookieName = getAuthSessionCookieName(
      configService.getOrThrow<boolean>('AUTH_COOKIE_SECURE'),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & AuthenticatedRequest>();
    const rawCookieToken: unknown = request.cookies?.[this.cookieName];
    const cookieToken =
      typeof rawCookieToken === 'string' ? rawCookieToken : undefined;
    const authorization = request.get('authorization');

    this.logger.log('SessionAuthGuard -> canActivate -> params:', {
      params: {
        authorizationPresent: typeof authorization === 'string',
        cookiePresent: typeof cookieToken === 'string',
        path: request.originalUrl,
      },
    });

    const bearerPresent = /^Bearer ([^\s]+)$/.test(authorization ?? '');
    if (typeof cookieToken === 'string' && bearerPresent) {
      this.logger.warn(
        'SessionAuthGuard -> canActivate -> ambiguousTransport error:',
        { data: { code: 'AUTH_TRANSPORT_AMBIGUOUS' } },
      );
      throw new BadRequestException({
        code: 'AUTH_TRANSPORT_AMBIGUOUS',
        details: {},
        message: 'Multiple authentication transports are not allowed.',
      });
    }

    const resolved = this.resolveTransport(cookieToken, authorization);
    if (resolved === null) {
      this.logger.warn(
        'SessionAuthGuard -> canActivate -> missingSession error:',
        { data: { code: 'AUTHENTICATION_REQUIRED' } },
      );
      throw this.authenticationRequired();
    }

    let session: VerifiedSession;
    try {
      session = await this.authSessionService.verifySession(
        resolved.token,
        resolved.channel,
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
      this.logger.warn(
        'SessionAuthGuard -> canActivate -> invalidSession error:',
        { data: { code: 'AUTHENTICATION_REQUIRED' } },
      );
      throw this.authenticationRequired();
    }

    const personId = session.personId;

    this.logger.log(
      'SessionAuthGuard -> canActivate -> authSessionService return:',
      { data: { personId } },
    );

    const person = await this.findPersonByIdService.execute(personId);
    this.logger.log(
      'SessionAuthGuard -> canActivate -> findPersonByIdService return:',
      { data: { found: person !== null, personId } },
    );

    if (person === null) {
      this.logger.warn(
        'SessionAuthGuard -> canActivate -> personMissing error:',
        { data: { code: 'AUTHENTICATION_REQUIRED', personId } },
      );
      throw this.authenticationRequired();
    }

    request.currentPerson = person;
    request.currentSession = session;
    const result = true;
    this.logger.log('SessionAuthGuard -> canActivate -> return:', {
      data: { authenticated: result, personId },
    });

    return result;
  }

  private resolveTransport(
    cookieToken: string | undefined,
    authorization: string | undefined,
  ): { channel: SessionChannel; token: string } | null {
    this.logger.log('SessionAuthGuard -> resolveTransport -> params:', {
      params: {
        authorizationPresent: authorization !== undefined,
        cookiePresent: cookieToken !== undefined,
      },
    });

    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
    if (match?.[1] !== undefined) {
      const result = { channel: 'native' as const, token: match[1] };
      this.logger.log('SessionAuthGuard -> resolveTransport -> return:', {
        data: { channel: result.channel, resolved: true },
      });
      return result;
    }

    if (authorization === undefined && cookieToken !== undefined) {
      const result = { channel: 'web' as const, token: cookieToken };
      this.logger.log('SessionAuthGuard -> resolveTransport -> return:', {
        data: { channel: result.channel, resolved: true },
      });
      return result;
    }

    const result = null;
    this.logger.log('SessionAuthGuard -> resolveTransport -> return:', {
      data: { resolved: false },
    });
    return result;
  }

  private authenticationRequired(): UnauthorizedException {
    this.logger.log('SessionAuthGuard -> authenticationRequired -> params:', {
      params: {},
    });

    const result = new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      details: {},
      message: 'Authentication is required.',
    });
    this.logger.log('SessionAuthGuard -> authenticationRequired -> return:', {
      data: { code: 'AUTHENTICATION_REQUIRED' },
    });

    return result;
  }
}
