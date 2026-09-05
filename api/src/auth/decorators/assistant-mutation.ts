import { applyDecorators, UseGuards } from '@nestjs/common';

import { RateLimited } from '~/auth/decorators/rate-limited';
import { CsrfGuard } from '~/auth/guards/csrf.guard';
import { RateLimitGuard } from '~/auth/guards/rate-limit.guard';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';

export function AssistantMessageMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'assistant-message',
      limitConfigKey: 'RATE_LIMIT_ASSISTANT_MESSAGE_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_ASSISTANT_MESSAGE_WINDOW_MS',
    }),
    UseGuards(SessionAuthGuard, RateLimitGuard, CsrfGuard),
  );
  return result;
}

export function AssistantDraftMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'assistant-draft',
      limitConfigKey: 'RATE_LIMIT_ASSISTANT_DRAFT_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_ASSISTANT_DRAFT_WINDOW_MS',
    }),
    UseGuards(SessionAuthGuard, RateLimitGuard, CsrfGuard),
  );
  return result;
}

export function AssistantConfirmMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'assistant-confirm',
      limitConfigKey: 'RATE_LIMIT_ASSISTANT_CONFIRM_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_ASSISTANT_CONFIRM_WINDOW_MS',
    }),
    UseGuards(SessionAuthGuard, RateLimitGuard, CsrfGuard),
  );
  return result;
}
