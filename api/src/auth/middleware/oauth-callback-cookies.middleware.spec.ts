import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  OAUTH_CODE_VERIFIER_COOKIE,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '~/auth/auth.constants';
import { OAuthCallbackCookiesMiddleware } from '~/auth/middleware/oauth-callback-cookies.middleware';

describe('OAuthCallbackCookiesMiddleware', () => {
  it('clears only temporary OAuth cookies before continuing', () => {
    const configService = { getOrThrow: vi.fn().mockReturnValue(false) };
    const clearCookie = vi.fn();
    const next = vi.fn();
    const middleware = new OAuthCallbackCookiesMiddleware(
      configService as unknown as ConfigService,
    );

    middleware.use(
      {} as Request,
      { clearCookie } as unknown as Response,
      next as NextFunction,
    );

    expect(clearCookie).toHaveBeenCalledTimes(3);
    expect(clearCookie).toHaveBeenNthCalledWith(
      1,
      OAUTH_STATE_COOKIE,
      expect.any(Object),
    );
    expect(clearCookie).toHaveBeenNthCalledWith(
      2,
      OAUTH_NONCE_COOKIE,
      expect.any(Object),
    );
    expect(clearCookie).toHaveBeenNthCalledWith(
      3,
      OAUTH_CODE_VERIFIER_COOKIE,
      expect.any(Object),
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
