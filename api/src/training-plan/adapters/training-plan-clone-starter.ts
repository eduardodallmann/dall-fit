export interface StartTrainingPlanCloneInput {
  cloneJobId: string;
  generation: number;
}

export class TrainingPlanCloneStartError extends Error {
  constructor(readonly ambiguous: boolean) {
    super('Training plan clone workflow could not be started.');
    this.name = 'TrainingPlanCloneStartError';
  }
}

export abstract class TrainingPlanCloneStarter {
  abstract start(input: StartTrainingPlanCloneInput): Promise<void>;
}
