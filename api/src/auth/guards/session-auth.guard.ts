import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { AUTH_SESSION_COOKIE } from '~/auth/auth.constants';
import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { FindPersonByIdService } from '~/person/services/find-person-by-id.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly findPersonByIdService: FindPersonByIdService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[AUTH_SESSION_COOKIE];

    this.logger.log('SessionAuthGuard -> canActivate -> params:', {
      params: {
        cookiePresent: typeof token === 'string',
        path: request.originalUrl,
      },
    });

    if (typeof token !== 'string') {
      this.logger.warn(
        'SessionAuthGuard -> canActivate -> missingSession error:',
        { data: { code: 'AUTHENTICATION_REQUIRED' } },
      );
      throw this.authenticationRequired();
    }

    let personId: string;
    try {
      personId = await this.authSessionService.verifySession(token);
    } catch {
      this.logger.warn(
        'SessionAuthGuard -> canActivate -> invalidSession error:',
        { data: { code: 'AUTHENTICATION_REQUIRED' } },
      );
      throw this.authenticationRequired();
    }

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
    const result = true;
    this.logger.log('SessionAuthGuard -> canActivate -> return:', {
      data: { authenticated: result, personId },
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
