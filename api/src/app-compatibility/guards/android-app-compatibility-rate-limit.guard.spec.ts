import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AndroidAppCompatibilityRateLimitGuard } from '~/app-compatibility/guards/android-app-compatibility-rate-limit.guard';

function context(method = 'GET') {
  const setHeader = vi.fn();
  const request = {
    ip: '127.0.0.1',
    method,
    socket: { remoteAddress: '127.0.0.1' },
  };
  const executionContext = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { executionContext, setHeader };
}

describe('AndroidAppCompatibilityRateLimitGuard', () => {
  it('limits repeated policy reads in memory and exposes retry-after', () => {
    const getOrThrow = vi.fn((key: string) =>
      key.endsWith('_LIMIT') ? 1 : 60_000,
    );
    const config = { getOrThrow } as unknown as ConfigService;
    const guard = new AndroidAppCompatibilityRateLimitGuard(config);
    const request = context();

    expect(guard.canActivate(request.executionContext)).toBe(true);
    expect(() => guard.canActivate(request.executionContext)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
    expect(request.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('does not rate limit preflight requests', () => {
    const getOrThrow = vi.fn();
    const config = { getOrThrow } as unknown as ConfigService;
    const guard = new AndroidAppCompatibilityRateLimitGuard(config);

    expect(guard.canActivate(context('OPTIONS').executionContext)).toBe(true);
    expect(getOrThrow).not.toHaveBeenCalled();
  });
});
