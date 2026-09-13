import {
  BadRequestException,
  Logger,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
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
    get: (name: string) => string | undefined;
  } = {
    get: vi.fn(() => undefined),
    originalUrl: '/auth/me',
  };
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
    vi.mocked(request.get).mockReturnValue(undefined);
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
    expect(authSessionService.verifySession).toHaveBeenCalledWith(
      'signed-session',
      'web',
    );
  });

  it('authenticates a native Bearer session', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const person = { id: 'person-001' };
    vi.mocked(request.get).mockReturnValue('Bearer native-session');
    const session = { channel: 'native', personId: 'person-001' };
    authSessionService.verifySession.mockResolvedValue(session);
    findPersonByIdService.execute.mockResolvedValue(person);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authSessionService.verifySession).toHaveBeenCalledWith(
      'native-session',
      'native',
    );
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(
      'Bearer native-session',
    );
    logSpy.mockRestore();
  });

  it('rejects simultaneous cookie and Authorization transports', async () => {
    request.cookies = { [AUTH_SESSION_COOKIE]: 'signed-session' };
    vi.mocked(request.get).mockReturnValue('Bearer native-session');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(authSessionService.verifySession).not.toHaveBeenCalled();
  });

  it('rejects a missing cookie', async () => {
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authSessionService.verifySession).not.toHaveBeenCalled();
  });

  it('rejects malformed Authorization as an invalid transport', async () => {
    vi.mocked(request.get).mockReturnValue('Basic credentials');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authSessionService.verifySession).not.toHaveBeenCalled();
  });

  it('rejects malformed Authorization even when a cookie is present', async () => {
    request.cookies = { [AUTH_SESSION_COOKIE]: 'signed-session' };
    vi.mocked(request.get).mockReturnValue('Basic credentials');

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
