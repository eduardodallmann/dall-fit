import { applyDecorators, UseGuards } from '@nestjs/common';

import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';

export function Authenticated(): MethodDecorator & ClassDecorator {
  const result = applyDecorators(UseGuards(SessionAuthGuard));

  return result;
}
