import { applyDecorators, UseGuards } from '@nestjs/common';

import { AdminAuthorizationGuard } from '~/auth/guards/admin-authorization.guard';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';

export function AdminOnly(): MethodDecorator & ClassDecorator {
  const result = applyDecorators(
    UseGuards(SessionAuthGuard, AdminAuthorizationGuard),
  );

  return result;
}
