import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { AdminAuthorizationGuard } from '~/auth/guards/admin-authorization.guard';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';

export const ADMIN_ONLY_METADATA = 'dall-fit:admin-only';

export function AdminOnly(): MethodDecorator & ClassDecorator {
  const result = applyDecorators(
    SetMetadata(ADMIN_ONLY_METADATA, true),
    UseGuards(SessionAuthGuard, AdminAuthorizationGuard),
  );

  return result;
}
