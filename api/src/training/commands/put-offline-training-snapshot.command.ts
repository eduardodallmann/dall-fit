import { Injectable, Logger } from '@nestjs/common';

import type {
  PutOfflineTrainingSnapshotResponse,
  PutOfflineTrainingSnapshotV1Request,
} from '@dall-fit/types';

import {
  AndroidAppCompatibilityService,
  type AndroidSnapshotClientHeaders,
} from '~/app-compatibility/services/android-app-compatibility.service';
import { TermsAccessService } from '~/terms/services/terms-access.service';
import { mapOfflineTrainingSnapshotHttpError } from '~/training/errors/offline-training-snapshot-http.errors';
import { OfflineTrainingSnapshotContentService } from '~/training/services/offline-training-snapshot-content.service';
import { OfflineTrainingSnapshotLockService } from '~/training/services/offline-training-snapshot-lock.service';
import { OfflineTrainingSnapshotService } from '~/training/services/offline-training-snapshot.service';
import { OfflineTrainingTerminalService } from '~/training/services/offline-training-terminal.service';

@Injectable()
export class PutOfflineTrainingSnapshotCommand {
  private readonly logger = new Logger(PutOfflineTrainingSnapshotCommand.name);

  constructor(
    private readonly termsAccess: TermsAccessService,
    private readonly compatibility: AndroidAppCompatibilityService,
    private readonly content: OfflineTrainingSnapshotContentService,
    private readonly locks: OfflineTrainingSnapshotLockService,
    private readonly snapshots: OfflineTrainingSnapshotService,
    private readonly terminals: OfflineTrainingTerminalService,
  ) {}

  async execute(
    personId: string,
    request: PutOfflineTrainingSnapshotV1Request,
    clientHeaders: AndroidSnapshotClientHeaders = {},
  ): Promise<PutOfflineTrainingSnapshotResponse> {
    this.logger.log('PutOfflineTrainingSnapshotCommand -> execute -> params:', {
      params: {
        payloadVersion: request.payloadVersion,
        revisionCategory: request.revision === 0 ? 'initial' : 'advanced',
        appVersionCodePresent: clientHeaders.appVersionCode !== undefined,
        syncContractVersionPresent:
          clientHeaders.syncContractVersion !== undefined,
      },
    });
    try {
      this.compatibility.validateSnapshotClient(clientHeaders);
      await this.termsAccess.require(personId);
      this.logger.log(
        'PutOfflineTrainingSnapshotCommand -> execute -> termsAccess return:',
        { data: { accepted: true } },
      );
      this.logger.log(
        'PutOfflineTrainingSnapshotCommand -> execute -> compatibility return:',
        { data: { compatible: true } },
      );
      const prepared = this.content.prepare(request);
      this.logger.log(
        'PutOfflineTrainingSnapshotCommand -> execute -> content return:',
        { data: { prepared: true } },
      );
      const lock = await this.locks.acquire(request.installationId);
      this.logger.log(
        'PutOfflineTrainingSnapshotCommand -> execute -> locks acquire return:',
        { data: { acquired: true } },
      );
      try {
        const replay = await this.terminals.replay(
          personId,
          request,
          prepared.contentHash,
        );
        this.logger.log(
          'PutOfflineTrainingSnapshotCommand -> execute -> terminals replay return:',
          { data: { found: replay !== null } },
        );
        if (replay !== null) {
          await this.snapshots.cleanupTerminal({
            contentHash: prepared.contentHash,
            executionId: request.executionId,
            personId,
            revision: request.revision,
          });
          this.logger.log(
            'PutOfflineTrainingSnapshotCommand -> execute -> snapshots cleanup return:',
            { data: { completed: true } },
          );
          const result: PutOfflineTrainingSnapshotResponse = { data: replay };
          this.logger.log(
            'PutOfflineTrainingSnapshotCommand -> execute -> replay return:',
            { data: { state: result.data.state } },
          );
          return result;
        }
        const ingested = await this.snapshots.ingest({
          ...prepared,
          personId,
          request,
        });
        this.logger.log(
          'PutOfflineTrainingSnapshotCommand -> execute -> snapshots return:',
          { data: { state: ingested.result.state } },
        );
        if (ingested.effectiveRequest.snapshot.state === 'in-progress') {
          const result: PutOfflineTrainingSnapshotResponse = {
            data: ingested.result,
          };
          this.logger.log(
            'PutOfflineTrainingSnapshotCommand -> execute -> progress return:',
            { data: { state: result.data.state } },
          );
          return result;
        }
        const terminal = await this.terminals.process({
          acceptedAt: ingested.result.acceptedAt,
          contentHash: ingested.contentHash,
          personId,
          request: ingested.effectiveRequest,
          ...(ingested.result.state === 'resolved-local' ||
          ingested.result.state === 'resolved-server'
            ? { resolutionState: ingested.result.state }
            : {}),
        });
        this.logger.log(
          'PutOfflineTrainingSnapshotCommand -> execute -> terminals process return:',
          { data: { state: terminal.state } },
        );
        await this.snapshots.cleanupTerminal({
          contentHash: ingested.contentHash,
          executionId: ingested.effectiveRequest.executionId,
          personId,
          revision: ingested.effectiveRequest.revision,
        });
        this.logger.log(
          'PutOfflineTrainingSnapshotCommand -> execute -> snapshots cleanup return:',
          { data: { completed: true } },
        );
        const result: PutOfflineTrainingSnapshotResponse = { data: terminal };
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
