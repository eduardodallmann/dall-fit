import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompleteGoogleLoginCommand } from '~/auth/commands/complete-google-login.command';
import { OAuthCallbackError } from '~/auth/errors/oauth-callback.error';
import type { AuthSessionService } from '~/auth/services/auth-session.service';
import type { GoogleOAuthService } from '~/auth/services/google-oauth.service';
import type { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';

describe('CompleteGoogleLoginCommand', () => {
  const configService = {
    getOrThrow: vi.fn().mockReturnValue('http://localhost:3000'),
  };
  const googleOAuthService = { exchangeCode: vi.fn() };
  const findOrCreatePersonService = { execute: vi.fn() };
  const authSessionService = { createSession: vi.fn() };
  const identity = {
    googleSubject: 'google-fixture-001',
    name: 'Alex Runner',
    email: 'alex.runner@example.test',
    photoUrl: null,
  };
  let command: CompleteGoogleLoginCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    configService.getOrThrow.mockReturnValue('http://localhost:3000');
    googleOAuthService.exchangeCode.mockResolvedValue(identity);
    findOrCreatePersonService.execute.mockResolvedValue({
      created: true,
      person: { id: 'person-001' },
    });
    authSessionService.createSession.mockResolvedValue({
      maxAgeMs: 600_000,
      token: 'signed-session',
    });
    command = new CompleteGoogleLoginCommand(
      configService as unknown as ConfigService,
      googleOAuthService as unknown as GoogleOAuthService,
      findOrCreatePersonService as unknown as FindOrCreatePersonService,
      authSessionService as unknown as AuthSessionService,
    );
  });

  it.each([true, false])(
    'creates a session after a valid callback when person created is %s',
    async (created) => {
      findOrCreatePersonService.execute.mockResolvedValue({
        created,
        person: { id: 'person-001' },
      });

      const result = await command.execute({
        callback: { code: 'one-time-code', state: 'matching-state' },
        codeVerifierCookie: 'code-verifier',
        nonceCookie: 'matching-nonce',
        stateCookie: 'matching-state',
      });

      expect(result).toEqual({
        redirectUrl: 'http://localhost:3000/dash',
        session: { maxAgeMs: 600_000, token: 'signed-session' },
        succeeded: true,
      });
      expect(googleOAuthService.exchangeCode).toHaveBeenCalledWith(
        'one-time-code',
        'matching-nonce',
        'code-verifier',
      );
      expect(findOrCreatePersonService.execute).toHaveBeenCalledWith(identity);
      expect(authSessionService.createSession).toHaveBeenCalledWith(
        'person-001',
        'web',
      );
    },
  );

  it.each([
    {
      callback: { code: 'code', state: 'wrong' },
      codeVerifierCookie: 'code-verifier',
      nonceCookie: 'nonce',
      stateCookie: 'expected',
    },
    {
      callback: { error: 'access_denied' },
      codeVerifierCookie: 'code-verifier',
      nonceCookie: 'nonce',
      stateCookie: 'expected',
    },
    {
      callback: {},
      codeVerifierCookie: undefined,
      nonceCookie: undefined,
      stateCookie: undefined,
    },
  ])('rejects an invalid callback without calling Google', async (input) => {
    const result = await command.execute(input);

    expect(result).toEqual({
      redirectUrl: 'http://localhost:3000/?authError=oauth_failed',
      session: null,
      succeeded: false,
    });
    expect(googleOAuthService.exchangeCode).not.toHaveBeenCalled();
  });

  it('returns a generic redirect when the provider rejects the callback', async () => {
    googleOAuthService.exchangeCode.mockRejectedValue(
      new OAuthCallbackError('sensitive provider error'),
    );

    const result = await command.execute({
      callback: { code: 'one-time-code', state: 'matching-state' },
      codeVerifierCookie: 'code-verifier',
      nonceCookie: 'matching-nonce',
      stateCookie: 'matching-state',
    });

    expect(result.succeeded).toBe(false);
    expect(result.session).toBeNull();
    expect(findOrCreatePersonService.execute).not.toHaveBeenCalled();
  });

  it('propagates an unexpected callback error as a technical failure', async () => {
    const result = command.execute({
      callback: { error: 'temporarily_unavailable' },
      codeVerifierCookie: 'code-verifier',
      nonceCookie: 'matching-nonce',
      stateCookie: 'matching-state',
    });

    await expect(result).rejects.toThrow(
      'OAuth provider returned an unexpected callback error.',
    );
    expect(googleOAuthService.exchangeCode).not.toHaveBeenCalled();
  });

  it.each([
    ['Google exchange', googleOAuthService.exchangeCode],
    ['person persistence', findOrCreatePersonService.execute],
    ['session storage', authSessionService.createSession],
  ])('propagates technical failure from %s', async (_step, failingMethod) => {
    const technicalError = new Error('technical failure');
    failingMethod.mockRejectedValueOnce(technicalError);

    const result = command.execute({
      callback: { code: 'one-time-code', state: 'matching-state' },
      codeVerifierCookie: 'code-verifier',
      nonceCookie: 'matching-nonce',
      stateCookie: 'matching-state',
    });

    await expect(result).rejects.toBe(technicalError);
  });
});
