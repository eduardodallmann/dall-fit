import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import type { PersonEntity } from '~/person/domain/person.entity';

export const CurrentPerson = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PersonEntity => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.currentPerson === undefined) {
      throw new Error('CurrentPerson requires SessionAuthGuard.');
    }

    const result = request.currentPerson;

    return result;
  },
);
