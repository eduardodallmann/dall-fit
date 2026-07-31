import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { AdminOnly } from '~/auth/decorators/admin-only';
import { AdminAuthorizationGuard } from '~/auth/guards/admin-authorization.guard';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';

describe('AdminOnly', () => {
  it('applies authentication before admin authorization', () => {
    class TestController {
      @AdminOnly()
      execute(): void {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'execute',
    );
    const handler: unknown = descriptor?.value;

    if (typeof handler !== 'function') {
      throw new Error('Expected the decorated handler to exist.');
    }

    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown;

    expect(guards).toEqual([SessionAuthGuard, AdminAuthorizationGuard]);
  });
});
