import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  NewWorkout,
  TrainingPlanWorkoutSummary,
  VersionedResult,
} from '~/training-plan/domain/training-plan.entity';
import {
  createTrainingPlanNotFoundException,
  createTrainingPlanSizeLimitException,
  createVersionConflictException,
  createWorkoutLimitException,
  createWorkoutNotFoundException,
} from '~/training-plan/errors/training-plan.errors';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import {
  MAX_WORKOUTS_PER_PLAN,
  TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT,
} from '~/training-plan/training-plan.constants';

export interface WorkoutDuplicationTarget {
  personId: string;
  trainingPlanId: string;
  workoutId: string;
  version: number;
}

@Injectable()
export class WorkoutDuplicationService {
  private readonly logger = new Logger(WorkoutDuplicationService.name);
  constructor(private readonly plans: TrainingPlanRepository) {}

  async prepare(target: WorkoutDuplicationTarget): Promise<NewWorkout> {
    this.logger.log('WorkoutDuplicationService -> prepare -> params:', {
      params: target,
    });
    await this.validate(target);
    this.logger.log(
      'WorkoutDuplicationService -> prepare -> validation completed:',
      { data: { valid: true } },
    );
    const source = await this.plans.findWorkout(
      target.trainingPlanId,
      target.workoutId,
      { ownerPersonId: target.personId },
    );
    this.logger.log('WorkoutDuplicationService -> prepare -> plans return:', {
      data: { found: source !== null, version: source?.version },
    });
    if (source === null) {
      this.logger.warn(
        'WorkoutDuplicationService -> prepare -> missingSource branch:',
        { data: {} },
      );
      throw createWorkoutNotFoundException();
    }
    if (source.version !== target.version) {
      this.logger.warn(
        'WorkoutDuplicationService -> prepare -> conflict branch:',
        { data: { version: source.version } },
      );
      throw createVersionConflictException();
    }
    const suffix = ' (cópia)';
    const now = new Date().toISOString();
    const result: NewWorkout = {
      id: randomBytes(12).toString('hex'),
      name: `${source.name.slice(0, 120 - suffix.length).trimEnd()}${suffix}`,
      createdAt: now,
      updatedAt: now,
      exercises: source.exercises.map((exercise) => ({
        ...exercise,
        id: randomBytes(12).toString('hex'),
      })),
    };
    this.logger.log('WorkoutDuplicationService -> prepare -> return:', {
      data: { exerciseCount: result.exercises.length },
    });
    return result;
  }

  async commit(
    target: WorkoutDuplicationTarget,
    workout: NewWorkout,
  ): Promise<VersionedResult<TrainingPlanWorkoutSummary>> {
    this.logger.log('WorkoutDuplicationService -> commit -> params:', {
      params: { ...target, exerciseCount: workout.exercises.length },
    });
    const appended = await this.plans.appendWorkout(
      target.trainingPlanId,
      target.workoutId,
      target.version,
      workout,
      { ownerPersonId: target.personId },
    );
    this.logger.log('WorkoutDuplicationService -> commit -> plans return:', {
      data: { appended },
    });
    if (!appended) {
      this.logger.warn(
        'WorkoutDuplicationService -> commit -> rejected branch:',
        { data: {} },
      );
      await this.validate(target);
      throw createTrainingPlanSizeLimitException();
    }
    const result = {
      data: {
        id: workout.id,
        name: workout.name,
        exerciseCount: workout.exercises.length,
      },
      version: target.version + 1,
    };
    this.logger.log('WorkoutDuplicationService -> commit -> return:', {
      data: { workoutId: result.data.id, version: result.version },
    });
    return result;
  }

  private async validate(target: WorkoutDuplicationTarget): Promise<void> {
    this.logger.log('WorkoutDuplicationService -> validate -> params:', {
      params: target,
    });
    const state = await this.plans.inspectTarget(
      target.trainingPlanId,
      target.workoutId,
      undefined,
      { ownerPersonId: target.personId },
    );
    this.logger.log('WorkoutDuplicationService -> validate -> plans return:', {
      data: {
        found: state.trainingPlanExists,
        workoutExists: state.workoutExists,
        version: state.version,
        workoutCount: state.workoutCount,
        bsonSize: state.bsonSize,
      },
    });
    let failure;
    if (!state.trainingPlanExists)
      failure = createTrainingPlanNotFoundException();
    else if (!state.workoutExists) failure = createWorkoutNotFoundException();
    else if (state.version !== target.version)
      failure = createVersionConflictException();
    else if ((state.workoutCount ?? 0) >= MAX_WORKOUTS_PER_PLAN)
      failure = createWorkoutLimitException();
    else if ((state.bsonSize ?? 0) >= TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT)
      failure = createTrainingPlanSizeLimitException();
    if (failure !== undefined) {
      this.logger.warn(
        'WorkoutDuplicationService -> validate -> rejected branch:',
        { data: { status: failure.getStatus() } },
      );
      throw failure;
    }
    this.logger.log('WorkoutDuplicationService -> validate -> completed:', {
      data: { valid: true },
    });
  }
}
