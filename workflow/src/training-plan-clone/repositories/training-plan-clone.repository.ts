import type {
  CloneWorkDecision,
  CopiedCloneImage,
  StartReservation,
  TrainingPlanCloneJob,
} from '../domain';

export abstract class TrainingPlanCloneRepository {
  abstract findJob(
    cloneJobId: string,
    generation: number,
  ): Promise<TrainingPlanCloneJob | null>;
  abstract reserveStart(
    cloneJobId: string,
    generation: number,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<StartReservation>;
  abstract claimRun(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<boolean>;
  abstract nextDecision(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
    batchSize: number,
  ): Promise<CloneWorkDecision>;
  abstract confirmCopiedImage(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
    image: CopiedCloneImage,
  ): Promise<void>;
  abstract beginFinalization(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<boolean>;
  abstract materializeClone(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void>;
  abstract cleanupKeys(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<string[]>;
  abstract markCancelled(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void>;
  abstract markFailed(
    cloneJobId: string,
    generation: number,
    workflowRunId: string,
  ): Promise<void>;
}
