import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { NativeSessionGuard } from '~/auth/guards/native-session.guard';

describe('NativeSessionGuard', () => {
  function context(channel: 'native' | 'web' | undefined): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          currentSession: channel === undefined ? undefined : { channel },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows only a previously verified native session', () => {
    const guard = new NativeSessionGuard();

    expect(guard.canActivate(context('native'))).toBe(true);
  });

  it.each(['web', undefined] as const)(
    'rejects the %s channel with a stable error',
    (channel) => {
      const guard = new NativeSessionGuard();

      expect(() => guard.canActivate(context(channel))).toThrow(
        ForbiddenException,
      );
    },
  );
});
