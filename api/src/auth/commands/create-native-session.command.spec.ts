import { Logger, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateNativeSessionCommand } from '~/auth/commands/create-native-session.command';
import { InvalidGoogleIdentityError } from '~/auth/errors/invalid-google-identity.error';
import type { AuthSessionService } from '~/auth/services/auth-session.service';
import type { GoogleOAuthService } from '~/auth/services/google-oauth.service';
import type { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';

describe('CreateNativeSessionCommand', () => {
  const googleOAuthService = { verifyNativeIdentityToken: vi.fn() };
  const findOrCreatePersonService = { execute: vi.fn() };
  const authSessionService = { createSession: vi.fn() };
  const identity = {
    email: 'runner@example.test',
    googleSubject: 'google-native-001',
    name: 'Native Runner',
    photoUrl: null,
  };
  const person = {
    configs: {},
    createdAt: '2026-09-12T12:00:00.000Z',
    email: identity.email,
    googleSubject: identity.googleSubject,
    id: 'person-001',
    name: identity.name,
    photoUrl: null,
    updatedAt: '2026-09-12T12:00:00.000Z',
  };
  let command: CreateNativeSessionCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    command = new CreateNativeSessionCommand(
      googleOAuthService as unknown as GoogleOAuthService,
      findOrCreatePersonService as unknown as FindOrCreatePersonService,
      authSessionService as unknown as AuthSessionService,
    );
  });

  it('validates identity, resolves the person and creates a native session', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    googleOAuthService.verifyNativeIdentityToken.mockResolvedValue(identity);
    findOrCreatePersonService.execute.mockResolvedValue({
      created: false,
      person,
    });
    authSessionService.createSession.mockResolvedValue({
      expiresAt: 1_789_200_000,
      maxAgeMs: 604_800_000,
      token: 'native-access-token',
    });

    const result = await command.execute('google-identity-token');

    expect(result).toMatchObject({
      data: {
        accessToken: 'native-access-token',
        expiresAt: '2026-09-12T08:00:00.000Z',
        person: { id: 'person-001', name: 'Native Runner' },
        tokenType: 'Bearer',
      },
    });
    expect(result.data.person).not.toHaveProperty('googleSubject');
    expect(findOrCreatePersonService.execute).toHaveBeenCalledWith(identity);
    expect(authSessionService.createSession).toHaveBeenCalledWith(
      'person-001',
      'native',
    );
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain('google-identity-token');
    expect(logged).not.toContain('native-access-token');
    logSpy.mockRestore();
  });

  it('maps a rejected Google identity to the stable public error', async () => {
    googleOAuthService.verifyNativeIdentityToken.mockRejectedValue(
      new InvalidGoogleIdentityError(),
    );

    await expect(command.execute('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findOrCreatePersonService.execute).not.toHaveBeenCalled();
    expect(authSessionService.createSession).not.toHaveBeenCalled();
  });

  it('propagates technical Google failures without creating state', async () => {
    const error = new Error('provider unavailable');
    googleOAuthService.verifyNativeIdentityToken.mockRejectedValue(error);

    await expect(command.execute('google-identity-token')).rejects.toBe(error);
    expect(findOrCreatePersonService.execute).not.toHaveBeenCalled();
  });
});
