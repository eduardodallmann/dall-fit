import { Buffer } from 'node:buffer';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type PipeTransform,
} from '@nestjs/common';

import type { PutOfflineTrainingSnapshotV1Request } from '@dall-fit/types';

import { offlineTrainingSnapshotRequestSchema } from '~/training/domain/offline-training-snapshot.schema';

export const OFFLINE_TRAINING_SNAPSHOT_MAX_BYTES = 1024 * 1024;

@Injectable()
export class OfflineTrainingSnapshotValidationPipe implements PipeTransform<
  unknown,
  PutOfflineTrainingSnapshotV1Request
> {
  private readonly logger = new Logger(
    OfflineTrainingSnapshotValidationPipe.name,
  );

  transform(value: unknown): PutOfflineTrainingSnapshotV1Request {
    const serialized = this.serialize(value);
    const sizeBytes = Buffer.byteLength(serialized);
    this.logger.log(
      'OfflineTrainingSnapshotValidationPipe -> transform -> params:',
      { params: { sizeCategory: this.sizeCategory(sizeBytes) } },
    );
    if (sizeBytes > OFFLINE_TRAINING_SNAPSHOT_MAX_BYTES) {
      this.logger.warn(
        'OfflineTrainingSnapshotValidationPipe -> transform -> payloadTooLarge error:',
        { data: { sizeCategory: 'over-limit' } },
      );
      throw new HttpException(
        {
          code: 'OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE',
          details: {},
          message: 'The offline training snapshot is too large.',
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const parsed = offlineTrainingSnapshotRequestSchema.safeParse(value);
    if (!parsed.success) {
      this.logger.warn(
        'OfflineTrainingSnapshotValidationPipe -> transform -> validation error:',
        { data: { issueCount: parsed.error.issues.length } },
      );
      throw new HttpException(
        {
          code: 'VALIDATION_ERROR',
          details: {},
          message: 'Validation failed.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = parsed.data;
    this.logger.log(
      'OfflineTrainingSnapshotValidationPipe -> transform -> return:',
      { data: { payloadVersion: result.payloadVersion } },
    );
    return result;
  }

  private serialize(value: unknown): string {
    this.logger.log(
      'OfflineTrainingSnapshotValidationPipe -> serialize -> params:',
      { params: { valuePresent: value !== undefined } },
    );
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error('Not serializable.');
      this.logger.log(
        'OfflineTrainingSnapshotValidationPipe -> serialize -> return:',
        { data: { serialized: true } },
      );
      return serialized;
    } catch {
      this.logger.warn(
        'OfflineTrainingSnapshotValidationPipe -> serialize -> invalid error:',
        { data: { serialized: false } },
      );
      throw new HttpException(
        {
          code: 'VALIDATION_ERROR',
          details: {},
          message: 'Validation failed.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private sizeCategory(sizeBytes: number): 'normal' | 'over-limit' {
    this.logger.log(
      'OfflineTrainingSnapshotValidationPipe -> sizeCategory -> params:',
      { params: { numeric: Number.isFinite(sizeBytes) } },
    );
    const result =
      sizeBytes > OFFLINE_TRAINING_SNAPSHOT_MAX_BYTES ? 'over-limit' : 'normal';
    this.logger.log(
      'OfflineTrainingSnapshotValidationPipe -> sizeCategory -> return:',
      { data: { result } },
    );
    return result;
  }
}
