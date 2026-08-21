import { WorkflowLogger } from '../../core/logger';
import type { CloneWorkDecision, StartReservation } from '../domain';
import type { TrainingPlanCloneRepository } from '../repositories/training-plan-clone.repository';
import type { CloneBlobService } from './clone-blob.service';

const START_LEASE_MS = 30_000;

export class TrainingPlanCloneService {
  private readonly logger = new WorkflowLogger(TrainingPlanCloneService.name);

  constructor(
    private readonly repository: TrainingPlanCloneRepository,
    private readonly blobService: CloneBlobService,
  ) {}

  async reserveStart(
    cloneJobId: string,
    generation: number,
    now: Date,
  ): Promise<StartReservation> {
    const job = await this.repository.findJob(cloneJobId, generation);
    if (job === null) throw new CloneStartError('job-not-found');
    if (job.state === 'completed' || job.state === 'cancelled')
      throw new CloneStartError('job-terminal');
    if (
      !['queued', 'cancelling'].includes(job.state) &&
      job.workflowRunId === null
    )
      throw new CloneStartError('job-state-conflict');
    const result = await this.repository.reserveStart(
      cloneJobId,
      generation,
      now,
      new Date(now.getTime() + START_LEASE_MS),
    );
    this.logger.info('reserveStart', 'return', {
      cloneJobId,
      generation,
      result,
    });
    return result;
  }

  async claimRun(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<boolean> {
    const result = await this.repository.claimRun(
      cloneJobId,
      generation,
      workflowRunId,
    );
    this.logger.info('claimRun', 'return', {
      claimed: result,
      cloneJobId,
      generation,
    });
    return result;
  }

  async nextDecision(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<CloneWorkDecision> {
    const result = await this.repository.nextDecision(
      cloneJobId,
      generation,
      workflowRunId,
      3,
    );
    this.logger.info('nextDecision', 'return', {
      cloneJobId,
      generation,
      kind: result.kind,
    });
    return result;
  }

  async copyBatch(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
    exerciseIds: readonly string[],
  ): Promise<void> {
    const job = await this.repository.findJob(cloneJobId, generation);
    if (job === null || job.workflowRunId !== workflowRunId) return;
    const copied = await Promise.all(
      exerciseIds.map((exerciseId) =>
        this.blobService.copyExerciseImage(job, exerciseId),
      ),
    );
    for (const image of copied)
      await this.repository.confirmCopiedImage(
        cloneJobId,
        generation,
        workflowRunId,
        image,
      );
    this.logger.info('copyBatch', 'completed', {
      cloneJobId,
      copiedCount: copied.length,
      generation,
    });
  }

  async finalize(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void> {
    const started = await this.repository.beginFinalization(
      cloneJobId,
      generation,
      workflowRunId,
    );
    if (started)
      await this.repository.materializeClone(
        cloneJobId,
        generation,
        workflowRunId,
      );
    this.logger.info('finalize', 'completed', {
      cloneJobId,
      generation,
      started,
    });
  }

  async cleanup(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void> {
    const keys = await this.repository.cleanupKeys(
      cloneJobId,
      generation,
      workflowRunId,
    );
    await this.blobService.deleteDestinations(keys);
    await this.repository.markCancelled(cloneJobId, generation, workflowRunId);
    this.logger.info('cleanup', 'completed', {
      cloneJobId,
      generation,
      removedVariantCount: keys.length,
    });
  }

  async markFailed(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void> {
    await this.repository.markFailed(cloneJobId, generation, workflowRunId);
    this.logger.warn('markFailed', 'completed', { cloneJobId, generation });
  }
}

export type CloneStartErrorCode =
  'job-not-found' | 'job-terminal' | 'job-state-conflict';

export class CloneStartError extends Error {
  constructor(readonly code: CloneStartErrorCode) {
    super(code);
    this.name = 'CloneStartError';
  }
}
