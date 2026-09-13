import {
  ServiceUnavailableException,
  type ExecutionContext,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidSessionError } from '~/auth/errors/invalid-session.error';
import { OptionalNativeSessionGuard } from '~/auth/guards/optional-native-session.guard';
import type { AuthSessionService } from '~/auth/services/auth-session.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

describe('OptionalNativeSessionGuard', () => {
  const authSessionService = { verifySession: vi.fn() };
  const request = {
    currentSession: undefined as unknown,
    get: vi.fn(),
    originalUrl: '/auth/native/session',
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const guard = new OptionalNativeSessionGuard(
    authSessionService as unknown as AuthSessionService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    request.currentSession = undefined;
  });

  it('attaches an active native session', async () => {
    const session = { channel: 'native', jti: 'session-001' };
    request.get.mockReturnValue('Bearer native-token');
    authSessionService.verifySession.mockResolvedValue(session);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.currentSession).toBe(session);
    expect(authSessionService.verifySession).toHaveBeenCalledWith(
      'native-token',
      'native',
    );
  });

  it.each([undefined, 'Basic value', 'Bearer', 'Bearer two values'])(
    'allows idempotent logout for absent or malformed header %j',
    async (authorization) => {
      request.get.mockReturnValue(authorization);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(authSessionService.verifySession).not.toHaveBeenCalled();
    },
  );

  it('allows idempotent logout for an inactive token', async () => {
    request.get.mockReturnValue('Bearer inactive-token');
    authSessionService.verifySession.mockRejectedValue(
      new InvalidSessionError(),
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.currentSession).toBeUndefined();
  });

  it('fails closed when Redis is unavailable', async () => {
    request.get.mockReturnValue('Bearer native-token');
    authSessionService.verifySession.mockRejectedValue(
      new RedisUnavailableError(),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates unexpected verification failures', async () => {
    const failure = new Error('unexpected verifier failure');
    request.get.mockReturnValue('Bearer native-token');
    authSessionService.verifySession.mockRejectedValue(failure);

    await expect(guard.canActivate(context)).rejects.toBe(failure);
  });
});
