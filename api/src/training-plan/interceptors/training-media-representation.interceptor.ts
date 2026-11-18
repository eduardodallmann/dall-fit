import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';

import { createValidationException } from '~/training-plan/errors/training-plan.errors';

export function legacyTrainingMedia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(legacyTrainingMedia);
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return value;
  const record = value as Record<string, unknown>;
  if (record.type === 'image' && record.sourceExerciseType === 'duration')
    return null;
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([key]) =>
          !(
            (record.type === 'duration' ||
              record.sourceExerciseType === 'duration') &&
            key === 'image'
          ),
      )
      .map(([key, item]) => [key, legacyTrainingMedia(item)]),
  );
}

@Injectable()
export class TrainingMediaRepresentationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(
    TrainingMediaRepresentationInterceptor.name,
  );

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const relevant =
      request.path.startsWith('/training') ||
      request.path.startsWith('/global/training-plans');
    this.logger.log(
      'TrainingMediaRepresentationInterceptor -> intercept -> params:',
      { params: { relevant } },
    );
    if (!relevant) {
      this.logger.log(
        'TrainingMediaRepresentationInterceptor -> intercept -> bypass branch:',
        { data: {} },
      );
      const result = next.handle();
      this.logger.log(
        'TrainingMediaRepresentationInterceptor -> intercept -> return:',
        { data: { transformed: false } },
      );
      return result;
    }
    const version = request.headers['x-training-media-version'];
    if (version !== undefined && version !== '1') {
      this.logger.warn(
        'TrainingMediaRepresentationInterceptor -> intercept -> invalidVersion branch:',
        { data: {} },
      );
      throw createValidationException();
    }
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    const result = next.handle().pipe(
      map((body: unknown) => {
        const transformed =
          version === undefined ? legacyTrainingMedia(body) : body;
        this.logger.log(
          'TrainingMediaRepresentationInterceptor -> intercept -> response prepared:',
          { data: { legacy: version === undefined } },
        );
        return transformed;
      }),
    );
    this.logger.log(
      'TrainingMediaRepresentationInterceptor -> intercept -> return:',
      { data: { legacy: version === undefined } },
    );
    return result;
  }
}
