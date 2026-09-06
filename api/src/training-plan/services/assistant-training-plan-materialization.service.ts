import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type { TrainingPlanAssistantDraft } from '@dall-fit/types';

import { PersonalTrainingPlanRepository } from '~/training-plan/repositories/personal-training-plan.repository';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';

export interface AssistantMaterializationIds {
  catalogEntryId: string;
  trainingPlanId: string;
}

@Injectable()
export class AssistantTrainingPlanMaterializationService {
  private readonly logger = new Logger(
    AssistantTrainingPlanMaterializationService.name,
  );

  constructor(
    private readonly trainingPlans: TrainingPlanRepository,
    private readonly personalCatalog: PersonalTrainingPlanRepository,
  ) {}

  reserveIds(): AssistantMaterializationIds {
    this.logger.log(
      'AssistantTrainingPlanMaterializationService -> reserveIds -> params:',
      { params: {} },
    );
    const result = {
      catalogEntryId: randomBytes(12).toString('hex'),
      trainingPlanId: randomBytes(12).toString('hex'),
    };
    this.logger.log(
      'AssistantTrainingPlanMaterializationService -> reserveIds -> return:',
      { data: result },
    );
    return result;
  }

  async materialize(
    personId: string,
    ids: AssistantMaterializationIds,
    draft: TrainingPlanAssistantDraft,
  ): Promise<void> {
    this.logger.log(
      'AssistantTrainingPlanMaterializationService -> materialize -> params:',
      {
        params: {
          ...ids,
          personId,
          workoutCount: draft.workouts.length,
        },
      },
    );
    await this.trainingPlans.createComplete({
      description: draft.description,
      id: ids.trainingPlanId,
      name: draft.planName,
      ownerPersonId: personId,
      workouts: draft.workouts.map((workout) => ({
        exercises: workout.exercises.map(
          ({ catalogKey: _catalogKey, ...exercise }) => ({
            ...exercise,
            id: randomBytes(12).toString('hex'),
          }),
        ),
        id: randomBytes(12).toString('hex'),
        name: workout.name,
      })),
    });
    this.logger.log(
      'AssistantTrainingPlanMaterializationService -> materialize -> trainingPlans completed:',
      { data: { trainingPlanId: ids.trainingPlanId } },
    );
    await this.personalCatalog.createOwnedEntryWithId(
      ids.catalogEntryId,
      personId,
      ids.trainingPlanId,
    );
    this.logger.log(
      'AssistantTrainingPlanMaterializationService -> materialize -> completed:',
      { data: ids },
    );
  }
}
