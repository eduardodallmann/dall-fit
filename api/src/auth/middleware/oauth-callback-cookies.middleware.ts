import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import { createClearOAuthCookieOptions } from '~/auth/auth-cookie-options';
import {
  OAUTH_CODE_VERIFIER_COOKIE,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '~/auth/auth.constants';

@Injectable()
export class OAuthCallbackCookiesMiddleware implements NestMiddleware {
  private readonly logger = new Logger(OAuthCallbackCookiesMiddleware.name);
  private readonly secureCookies: boolean;

  constructor(configService: ConfigService) {
    this.secureCookies =
      configService.getOrThrow<boolean>('AUTH_COOKIE_SECURE');
  }

  use(_request: Request, response: Response, next: NextFunction): void {
    this.logger.log('OAuthCallbackCookiesMiddleware -> use -> params:', {
      params: {},
    });
    const options = createClearOAuthCookieOptions(this.secureCookies);
    response.clearCookie(OAUTH_STATE_COOKIE, options);
    response.clearCookie(OAUTH_NONCE_COOKIE, options);
    response.clearCookie(OAUTH_CODE_VERIFIER_COOKIE, options);
    this.logger.log('OAuthCallbackCookiesMiddleware -> use -> completed:', {
      data: { cookieCount: 3 },
    });
    next();
  }
}
