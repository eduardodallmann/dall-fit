import {
  Injectable,
  Logger,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { AUTH_TEST_KEY_HEADER } from '~/auth/auth.constants';

@Injectable()
export class TestAuthBypassGuard implements CanActivate {
  private readonly logger = new Logger(TestAuthBypassGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const configuredKey = this.configService.get<string>(
      'AUTH_TEST_BYPASS_KEY',
    );
    const enabled = this.configService.getOrThrow<boolean>(
      'AUTH_TEST_BYPASS_ENABLED',
    );
    const environment = this.configService.getOrThrow<string>('NODE_ENV');
    const requestKey = request.header(AUTH_TEST_KEY_HEADER);

    this.logger.log('TestAuthBypassGuard -> canActivate -> params:', {
      params: {
        enabled,
        environment,
        requestKeyPresent: typeof requestKey === 'string',
      },
    });

    const allowed =
      enabled &&
      environment !== 'production' &&
      typeof configuredKey === 'string' &&
      requestKey === configuredKey;

    if (!allowed) {
      this.logger.warn(
        'TestAuthBypassGuard -> canActivate -> blocked branch:',
        { data: { code: 'RESOURCE_NOT_FOUND' } },
      );
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        details: {},
        message: 'Resource not found.',
      });
    }

    this.logger.log('TestAuthBypassGuard -> canActivate -> allowed branch:', {
      data: { allowed: true },
    });

    const result = true;
    this.logger.log('TestAuthBypassGuard -> canActivate -> return:', {
      data: { allowed: result },
    });

    return result;
  }
}
