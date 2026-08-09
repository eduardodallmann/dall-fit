import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_SESSION_COOKIE } from '~/auth/auth.constants';
import { InvalidSessionError } from '~/auth/errors/invalid-session.error';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';
import type { AuthSessionService } from '~/auth/services/auth-session.service';
import type { FindPersonByIdService } from '~/person/services/find-person-by-id.service';

describe('SessionAuthGuard', () => {
  const authSessionService = { verifySession: vi.fn() };
  const findPersonByIdService = { execute: vi.fn() };
  const request: {
    cookies?: Record<string, string>;
    currentPerson?: unknown;
    currentSession?: unknown;
    originalUrl: string;
  } = { originalUrl: '/auth/me' };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  let guard: SessionAuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    delete request.cookies;
    delete request.currentPerson;
    delete request.currentSession;
    guard = new SessionAuthGuard(
      {
        getOrThrow: vi.fn().mockReturnValue(false),
      } as unknown as ConfigService,
      authSessionService as unknown as AuthSessionService,
      findPersonByIdService as unknown as FindPersonByIdService,
    );
  });

  it('attaches the person after validating the session', async () => {
    const person = { id: 'person-001' };
    request.cookies = { [AUTH_SESSION_COOKIE]: 'signed-session' };
    const session = { personId: 'person-001' };
    authSessionService.verifySession.mockResolvedValue(session);
    findPersonByIdService.execute.mockResolvedValue(person);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.currentPerson).toBe(person);
    expect(request.currentSession).toBe(session);
  });

  it('rejects a missing cookie', async () => {
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authSessionService.verifySession).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    request.cookies = { [AUTH_SESSION_COOKIE]: 'invalid-session' };
    authSessionService.verifySession.mockRejectedValue(
      new InvalidSessionError(),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a session whose person no longer exists', async () => {
    request.cookies = { [AUTH_SESSION_COOKIE]: 'signed-session' };
    authSessionService.verifySession.mockResolvedValue({
      personId: 'person-missing',
    });
    findPersonByIdService.execute.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('propagates a technical failure while loading the person', async () => {
    const databaseError = new Error('database unavailable');
    request.cookies = { [AUTH_SESSION_COOKIE]: 'signed-session' };
    authSessionService.verifySession.mockResolvedValue({
      personId: 'person-001',
    });
    findPersonByIdService.execute.mockRejectedValue(databaseError);

    await expect(guard.canActivate(context)).rejects.toBe(databaseError);
  });
});
