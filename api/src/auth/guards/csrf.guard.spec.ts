import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '~/auth/guards/csrf.guard';

describe('CsrfGuard', () => {
  const request = {
    currentSession: undefined as unknown,
    get: vi.fn(),
    originalUrl: '/auth/me',
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const guard = new CsrfGuard({
    getOrThrow: vi.fn().mockReturnValue('http://localhost:3000'),
  } as unknown as ConfigService);

  beforeEach(() => {
    vi.clearAllMocks();
    request.currentSession = undefined;
    request.get.mockReturnValue(undefined);
  });

  it('allows a verified native session without CSRF material', () => {
    request.currentSession = {
      channel: 'native',
      csrfToken: 'unused',
    };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a Web session only with exact origin and token', () => {
    request.currentSession = { channel: 'web', csrfToken: 'csrf-token' };
    request.get.mockImplementation((name: string) =>
      name === 'origin' ? 'http://localhost:3000' : 'csrf-token',
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects invalid Web CSRF material', () => {
    request.currentSession = { channel: 'web', csrfToken: 'csrf-token' };
    request.get.mockImplementation((name: string) =>
      name === 'origin' ? 'http://localhost:3000' : 'different-token',
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
