import { Injectable, Logger } from '@nestjs/common';

import type {
  PutOfflineTrainingSnapshotResponse,
  PutOfflineTrainingSnapshotV1Request,
} from '@dall-fit/types';

import { mapOfflineTrainingSnapshotHttpError } from '~/training/errors/offline-training-snapshot-http.errors';
import { OfflineTrainingSnapshotContentService } from '~/training/services/offline-training-snapshot-content.service';
import { OfflineTrainingSnapshotLockService } from '~/training/services/offline-training-snapshot-lock.service';
import { OfflineTrainingSnapshotService } from '~/training/services/offline-training-snapshot.service';

@Injectable()
export class PutOfflineTrainingSnapshotCommand {
  private readonly logger = new Logger(PutOfflineTrainingSnapshotCommand.name);

  constructor(
    private readonly content: OfflineTrainingSnapshotContentService,
    private readonly locks: OfflineTrainingSnapshotLockService,
    private readonly snapshots: OfflineTrainingSnapshotService,
  ) {}

  async execute(
    personId: string,
    request: PutOfflineTrainingSnapshotV1Request,
  ): Promise<PutOfflineTrainingSnapshotResponse> {
    this.logger.log('PutOfflineTrainingSnapshotCommand -> execute -> params:', {
      params: {
        payloadVersion: request.payloadVersion,
        revisionCategory: request.revision === 0 ? 'initial' : 'advanced',
      },
    });
    const prepared = this.content.prepare(request);
    this.logger.log(
      'PutOfflineTrainingSnapshotCommand -> execute -> content return:',
      { data: { prepared: true } },
    );
    try {
      const lock = await this.locks.acquire(request.installationId);
      this.logger.log(
        'PutOfflineTrainingSnapshotCommand -> execute -> locks acquire return:',
        { data: { acquired: true } },
      );
      try {
        const snapshot = await this.snapshots.ingest({
          ...prepared,
          personId,
          request,
        });
        this.logger.log(
          'PutOfflineTrainingSnapshotCommand -> execute -> snapshots return:',
          { data: { state: snapshot.state } },
        );
        const result: PutOfflineTrainingSnapshotResponse = { data: snapshot };
        this.logger.log(
          'PutOfflineTrainingSnapshotCommand -> execute -> return:',
          { data: { state: result.data.state } },
        );
        return result;
      } finally {
        await this.locks.release(lock);
        this.logger.log(
          'PutOfflineTrainingSnapshotCommand -> execute -> locks release completed:',
          { data: { released: true } },
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        'PutOfflineTrainingSnapshotCommand -> execute -> failed branch:',
        {
          data: { errorName: error instanceof Error ? error.name : 'Unknown' },
        },
      );
      mapOfflineTrainingSnapshotHttpError(error);
    }
  }
}
