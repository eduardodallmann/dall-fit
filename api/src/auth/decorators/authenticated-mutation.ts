import { applyDecorators, UseGuards } from '@nestjs/common';

import { RateLimited } from '~/auth/decorators/rate-limited';
import { CsrfGuard } from '~/auth/guards/csrf.guard';
import { RateLimitGuard } from '~/auth/guards/rate-limit.guard';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';

export function AuthenticatedMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'auth-mutation',
      limitConfigKey: 'RATE_LIMIT_AUTHENTICATED_MUTATION_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_AUTHENTICATED_MUTATION_WINDOW_MS',
    }),
    UseGuards(SessionAuthGuard, RateLimitGuard, CsrfGuard),
  );

  return result;
}

export function AdminMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'admin-mutation',
      limitConfigKey: 'RATE_LIMIT_ADMIN_MUTATION_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_ADMIN_MUTATION_WINDOW_MS',
    }),
    UseGuards(RateLimitGuard, CsrfGuard),
  );

  return result;
}
