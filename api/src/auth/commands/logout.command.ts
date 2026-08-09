import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { VerifiedSession } from '~/auth/domain/auth.types';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

@Injectable()
export class LogoutCommand {
  private readonly logger = new Logger(LogoutCommand.name);

  constructor(private readonly authSessionService: AuthSessionService) {}

  async execute(session?: VerifiedSession): Promise<void> {
    this.logger.log('LogoutCommand -> execute -> params:', {
      params: { activeSession: session !== undefined },
    });
    if (session !== undefined) {
      try {
        await this.authSessionService.revokeSession(session.jti);
      } catch (error: unknown) {
        if (error instanceof RedisUnavailableError) {
          throw new ServiceUnavailableException({
            code: 'AUTHENTICATION_UNAVAILABLE',
            details: {},
            message: 'Authentication is temporarily unavailable.',
          });
        }
        throw error;
      }
      this.logger.log(
        'LogoutCommand -> execute -> authSessionService completed:',
        { data: { personId: session.personId } },
      );
    }
    this.logger.log('LogoutCommand -> execute -> completed:', {
      data: { revoked: session !== undefined },
    });
  }
}
