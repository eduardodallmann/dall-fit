import { start } from 'workflow/api';

import { WorkflowLogger } from '../../core/logger';
import type { StartCloneRunInput } from '../domain';
import type { TrainingPlanCloneService } from '../services/training-plan-clone.service';
import { trainingPlanCloneWorkflow } from '../workflows/training-plan-clone';

export class StartTrainingPlanCloneRunCommand {
  private readonly logger = new WorkflowLogger(
    StartTrainingPlanCloneRunCommand.name,
  );

  constructor(
    private readonly trainingPlanCloneService: TrainingPlanCloneService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: StartCloneRunInput): Promise<void> {
    this.logger.info('execute', 'params', {
      cloneJobId: input.cloneJobId,
      generation: input.generation,
    });
    const reservation = await this.trainingPlanCloneService.reserveStart(
      input.cloneJobId,
      input.generation,
      this.now(),
    );
    if (reservation === 'start') {
      const run = await start(trainingPlanCloneWorkflow, [
        input.cloneJobId,
        input.generation,
      ]);
      this.logger.info('execute', 'workflow accepted', {
        cloneJobId: input.cloneJobId,
        generation: input.generation,
        workflowRunId: run.runId,
      });
    }
    this.logger.info('execute', 'return', {
      cloneJobId: input.cloneJobId,
      generation: input.generation,
      reservation,
    });
  }
}
