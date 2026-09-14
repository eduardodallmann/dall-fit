import { applyDecorators, UseGuards } from '@nestjs/common';

import { RateLimited } from '~/auth/decorators/rate-limited';
import { CsrfGuard } from '~/auth/guards/csrf.guard';
import { NativeSessionGuard } from '~/auth/guards/native-session.guard';
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

export function EditorMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'editor-mutation',
      limitConfigKey: 'RATE_LIMIT_EDITOR_MUTATION_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_EDITOR_MUTATION_WINDOW_MS',
    }),
    UseGuards(RateLimitGuard, CsrfGuard),
  );
  return result;
}

export function ImageMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'image-mutation',
      limitConfigKey: 'RATE_LIMIT_IMAGE_MUTATION_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_IMAGE_MUTATION_WINDOW_MS',
    }),
    UseGuards(RateLimitGuard, CsrfGuard),
  );
  return result;
}

export function TrainingMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'training-mutation',
      limitConfigKey: 'RATE_LIMIT_TRAINING_MUTATION_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_TRAINING_MUTATION_WINDOW_MS',
    }),
    UseGuards(SessionAuthGuard, RateLimitGuard, CsrfGuard),
  );
  return result;
}

export function TrainingLifecycleMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'training-lifecycle',
      limitConfigKey: 'RATE_LIMIT_TRAINING_LIFECYCLE_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_TRAINING_LIFECYCLE_WINDOW_MS',
    }),
    UseGuards(SessionAuthGuard, RateLimitGuard, CsrfGuard),
  );
  return result;
}

export function NativeTrainingLifecycleMutation(): MethodDecorator {
  const result = applyDecorators(
    RateLimited({
      bucket: 'training-lifecycle',
      limitConfigKey: 'RATE_LIMIT_TRAINING_LIFECYCLE_LIMIT',
      subject: 'person-ip',
      windowConfigKey: 'RATE_LIMIT_TRAINING_LIFECYCLE_WINDOW_MS',
    }),
    UseGuards(SessionAuthGuard, NativeSessionGuard, RateLimitGuard, CsrfGuard),
  );
  return result;
}
