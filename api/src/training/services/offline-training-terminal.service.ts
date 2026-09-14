import { Injectable, Logger } from '@nestjs/common';

import type {
  OfflineTrainingSnapshotResult,
  PutOfflineTrainingSnapshotV1Request,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

import type { StoredOfflineTrainingTerminalReceipt } from '~/training/domain/offline-training-terminal.types';
import { OfflineTrainingExecutionImmutableError } from '~/training/errors/offline-training-snapshot.errors';
import { OfflineTrainingTerminalReceiptRepository } from '~/training/repositories/offline-training-terminal-receipt.repository';
import { TrainingService } from '~/training/services/training.service';

interface ProcessTerminalInput {
  acceptedAt: string;
  contentHash: string;
  personId: string;
  request: PutOfflineTrainingSnapshotV1Request;
  resolutionState?: 'resolved-local' | 'resolved-server';
}

@Injectable()
export class OfflineTrainingTerminalService {
  private readonly logger = new Logger(OfflineTrainingTerminalService.name);

  constructor(
    private readonly receipts: OfflineTrainingTerminalReceiptRepository,
    private readonly training: TrainingService,
  ) {}

  async replay(
    personId: string,
    request: PutOfflineTrainingSnapshotV1Request,
    contentHash: string,
  ): Promise<OfflineTrainingSnapshotResult | null> {
    this.logger.log('OfflineTrainingTerminalService -> replay -> params:', {
      params: { snapshotState: request.snapshot.state },
    });
    const receipt = await this.receipts.find(personId, request.executionId);
    this.logger.log(
      'OfflineTrainingTerminalService -> replay -> receipts return:',
      { data: { found: receipt !== null } },
    );
    if (receipt === null) {
      this.logger.log('OfflineTrainingTerminalService -> replay -> return:', {
        data: { found: false },
      });
      return null;
    }
    const matches =
      receipt.contentHash === contentHash &&
      receipt.revision === request.revision &&
      receipt.terminalState === request.snapshot.state;
    if (!matches) await this.throwImmutable(personId, receipt);
    const result = await this.toReplayResult(personId, receipt);
    this.logger.log('OfflineTrainingTerminalService -> replay -> return:', {
      data: { state: result.state },
    });
    return result;
  }

  async process(
    input: ProcessTerminalInput,
  ): Promise<OfflineTrainingSnapshotResult> {
    this.logger.log('OfflineTrainingTerminalService -> process -> params:', {
      params: { snapshotState: input.request.snapshot.state },
    });
    const snapshot = input.request.snapshot;
    if (snapshot.state === 'in-progress') {
      throw new Error('An in-progress snapshot is not terminal.');
    }
    let completion: WorkoutExecutionSummary | undefined;
    if (snapshot.state === 'completed') {
      completion = await this.training.completeOfflineSnapshot(
        input.personId,
        input.request.executionId,
        input.request.revision,
        snapshot,
      );
      this.logger.log(
        'OfflineTrainingTerminalService -> process -> training return:',
        { data: { completed: true } },
      );
    }
    const receipt = await this.receipts.create({
      acceptedAt: new Date(input.acceptedAt),
      contentHash: input.contentHash,
      executionId: input.request.executionId,
      personId: input.personId,
      revision: input.request.revision,
      terminalState: snapshot.state,
      ...(completion === undefined
        ? {}
        : { workoutExecutionId: completion.id }),
    });
    this.logger.log(
      'OfflineTrainingTerminalService -> process -> receipts return:',
      { data: { terminalState: receipt.terminalState } },
    );
    const matches =
      receipt.contentHash === input.contentHash &&
      receipt.revision === input.request.revision &&
      receipt.terminalState === snapshot.state;
    if (!matches) await this.throwImmutable(input.personId, receipt);
    const result: OfflineTrainingSnapshotResult = {
      acceptedAt: receipt.acceptedAt.toISOString(),
      ...(completion === undefined ? {} : { completion }),
      executionId: receipt.executionId,
      orderedAt: receipt.acceptedAt.toISOString(),
      revision: receipt.revision,
      snapshotState: receipt.terminalState,
      state:
        input.resolutionState ??
        (receipt.terminalState === 'completed' ? 'completed' : 'cancelled'),
    };
    this.logger.log('OfflineTrainingTerminalService -> process -> return:', {
      data: { state: result.state },
    });
    return result;
  }

  private async toReplayResult(
    personId: string,
    receipt: StoredOfflineTrainingTerminalReceipt,
  ): Promise<OfflineTrainingSnapshotResult> {
    this.logger.log(
      'OfflineTrainingTerminalService -> toReplayResult -> params:',
      { params: { terminalState: receipt.terminalState } },
    );
    const completion = await this.completion(personId, receipt);
    const result: OfflineTrainingSnapshotResult = {
      acceptedAt: receipt.acceptedAt.toISOString(),
      ...(completion === undefined ? {} : { completion }),
      executionId: receipt.executionId,
      orderedAt: receipt.acceptedAt.toISOString(),
      revision: receipt.revision,
      snapshotState: receipt.terminalState,
      state:
        receipt.terminalState === 'completed'
          ? 'duplicate-completed'
          : 'duplicate-cancelled',
    };
    this.logger.log(
      'OfflineTrainingTerminalService -> toReplayResult -> return:',
      { data: { state: result.state } },
    );
    return result;
  }

  private async completion(
    personId: string,
    receipt: StoredOfflineTrainingTerminalReceipt,
  ): Promise<WorkoutExecutionSummary | undefined> {
    this.logger.log('OfflineTrainingTerminalService -> completion -> params:', {
      params: { terminalState: receipt.terminalState },
    });
    if (
      receipt.terminalState === 'cancelled' ||
      receipt.workoutExecutionId === undefined
    ) {
      this.logger.log(
        'OfflineTrainingTerminalService -> completion -> return:',
        { data: { present: false } },
      );
      return undefined;
    }
    const result = await this.training.completion(
      personId,
      receipt.workoutExecutionId,
    );
    this.logger.log(
      'OfflineTrainingTerminalService -> completion -> training return:',
      { data: { present: true } },
    );
    this.logger.log('OfflineTrainingTerminalService -> completion -> return:', {
      data: { present: true },
    });
    return result;
  }

  private async throwImmutable(
    personId: string,
    receipt: StoredOfflineTrainingTerminalReceipt,
  ): Promise<never> {
    this.logger.log(
      'OfflineTrainingTerminalService -> throwImmutable -> params:',
      { params: { terminalState: receipt.terminalState } },
    );
    const completion = await this.completion(personId, receipt);
    this.logger.warn(
      'OfflineTrainingTerminalService -> throwImmutable -> immutable error:',
      { data: { terminalState: receipt.terminalState } },
    );
    throw new OfflineTrainingExecutionImmutableError(
      receipt.terminalState,
      completion,
    );
  }
}
