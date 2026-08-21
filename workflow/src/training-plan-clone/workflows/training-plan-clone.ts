import { getWorkflowMetadata } from 'workflow';

import { MongoTrainingPlanCloneRepository } from '../repositories/mongo-training-plan-clone.repository';
import { CloneBlobService } from '../services/clone-blob.service';
import { TrainingPlanCloneService } from '../services/training-plan-clone.service';

function service(): TrainingPlanCloneService {
  return new TrainingPlanCloneService(
    new MongoTrainingPlanCloneRepository(),
    new CloneBlobService(),
  );
}

export async function claimCloneRunStep(
  cloneJobId: string,
  generation: number,
  workflowRunId: string,
): Promise<boolean> {
  'use step';
  const result = await service().claimRun(
    cloneJobId,
    generation,
    workflowRunId,
  );
  return result;
}

export async function nextCloneDecisionStep(
  cloneJobId: string,
  generation: number,
  workflowRunId: string,
) {
  'use step';
  const result = await service().nextDecision(
    cloneJobId,
    generation,
    workflowRunId,
  );
  return result;
}

export async function copyCloneBatchStep(
  cloneJobId: string,
  generation: number,
  workflowRunId: string,
  exerciseIds: string[],
): Promise<void> {
  'use step';
  await service().copyBatch(cloneJobId, generation, workflowRunId, exerciseIds);
}

export async function finalizeCloneStep(
  cloneJobId: string,
  generation: number,
  workflowRunId: string,
): Promise<void> {
  'use step';
  await service().finalize(cloneJobId, generation, workflowRunId);
}

export async function cleanupCloneStep(
  cloneJobId: string,
  generation: number,
  workflowRunId: string,
): Promise<void> {
  'use step';
  await service().cleanup(cloneJobId, generation, workflowRunId);
}

export async function markCloneFailedStep(
  cloneJobId: string,
  generation: number,
  workflowRunId: string,
): Promise<void> {
  'use step';
  await service().markFailed(cloneJobId, generation, workflowRunId);
}

export async function trainingPlanCloneWorkflow(
  cloneJobId: string,
  generation: number,
): Promise<void> {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const claimed = await claimCloneRunStep(
    cloneJobId,
    generation,
    workflowRunId,
  );
  if (!claimed) return;
  try {
    for (;;) {
      const decision = await nextCloneDecisionStep(
        cloneJobId,
        generation,
        workflowRunId,
      );
      if (decision.kind === 'obsolete') return;
      if (decision.kind === 'cleanup') {
        await cleanupCloneStep(cloneJobId, generation, workflowRunId);
        return;
      }
      if (decision.kind === 'finalize') {
        await finalizeCloneStep(cloneJobId, generation, workflowRunId);
        return;
      }
      await copyCloneBatchStep(
        cloneJobId,
        generation,
        workflowRunId,
        decision.exerciseIds,
      );
    }
  } catch {
    await markCloneFailedStep(cloneJobId, generation, workflowRunId);
  }
}
