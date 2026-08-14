import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  CreateTrainingPlanRequest,
  ExerciseType,
  TrainingPlanSummary,
  TrainingPlanWorkoutSummary,
  UpdateExerciseRequest,
  UpdateTrainingPlanRequest,
} from '@dall-fit/types';

import type {
  StoredExercise,
  StoredExerciseImage,
  TargetState,
  TrainingPlanEntity,
  TrainingPlanPage,
  VersionedResult,
  WorkoutAggregate,
  WorkoutNameResult,
} from '~/training-plan/domain/training-plan.entity';
import {
  createExerciseLimitException,
  createExerciseNotFoundException,
  createInvalidExerciseOrderException,
  createInvalidExerciseTypeException,
  createTrainingPlanNotFoundException,
  createTrainingPlanSizeLimitException,
  createVersionConflictException,
  createWorkoutLimitException,
  createWorkoutNotFoundException,
} from '~/training-plan/errors/training-plan.errors';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { YoutubeReferenceService } from '~/training-plan/services/youtube-reference.service';
import {
  DEFAULT_WORKOUT_NAME,
  MAX_EXERCISES_PER_WORKOUT,
  MAX_WORKOUTS_PER_PLAN,
  TRAINING_PLAN_CURSOR_WARNING_TOTAL,
  TRAINING_PLAN_EXERCISE_WARNING,
  TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT,
  TRAINING_PLAN_PAGE_SIZE,
  TRAINING_PLAN_SIZE_WARNING,
  TRAINING_PLAN_WORKOUT_WARNING,
} from '~/training-plan/training-plan.constants';

const editableFields: Record<ExerciseType, ReadonlySet<string>> = {
  'youtube-short': new Set([
    'name',
    'youtubeId',
    'bodyArea',
    'restSeconds',
    'sets',
    'repetitions',
  ]),
  image: new Set(['name', 'bodyArea', 'restSeconds', 'sets', 'repetitions']),
  'youtube-long': new Set(['name', 'youtubeId', 'bodyArea']),
  pause: new Set(['restSeconds']),
  duration: new Set(['name', 'bodyArea', 'durationMinutes']),
};

@Injectable()
export class TrainingPlanService {
  private readonly logger = new Logger(TrainingPlanService.name);
  private cursorCapacityWarningEmitted = false;

  constructor(
    private readonly trainingPlanRepository: TrainingPlanRepository,
    private readonly youtubeReferenceService: YoutubeReferenceService,
    private readonly exerciseImageService: ExerciseImageService,
  ) {}

  async listGlobal(page: number): Promise<TrainingPlanPage> {
    this.logger.log('TrainingPlanService -> listGlobal -> params:', {
      params: { page },
    });
    const result = await this.trainingPlanRepository.listGlobal(
      page,
      TRAINING_PLAN_PAGE_SIZE,
    );
    if (
      result.total >= TRAINING_PLAN_CURSOR_WARNING_TOTAL &&
      !this.cursorCapacityWarningEmitted
    ) {
      this.cursorCapacityWarningEmitted = true;
      this.logger.warn(
        'TrainingPlanService -> listGlobal -> cursorCapacityNearLimit:',
        { data: { total: result.total } },
      );
    }
    this.logger.log('TrainingPlanService -> listGlobal -> return:', {
      data: { count: result.data.length, total: result.total },
    });
    return result;
  }

  async createGlobal(
    input: CreateTrainingPlanRequest,
  ): Promise<TrainingPlanEntity> {
    this.logger.log('TrainingPlanService -> createGlobal -> params:', {
      params: { fields: Object.keys(input) },
    });
    const result = await this.trainingPlanRepository.create({
      ...input,
      ownerPersonId: null,
    });
    this.logger.log('TrainingPlanService -> createGlobal -> return:', {
      data: { trainingPlanId: result.id, version: result.version },
    });
    return result;
  }

  async getGlobal(trainingPlanId: string): Promise<TrainingPlanEntity> {
    this.logger.log('TrainingPlanService -> getGlobal -> params:', {
      params: { trainingPlanId },
    });
    const result =
      await this.trainingPlanRepository.findGlobalById(trainingPlanId);
    if (result === null) throw createTrainingPlanNotFoundException();
    this.logger.log('TrainingPlanService -> getGlobal -> return:', {
      data: { trainingPlanId, version: result.version },
    });
    return result;
  }

  async updateGlobal(
    trainingPlanId: string,
    expectedVersion: number,
    changes: UpdateTrainingPlanRequest,
  ): Promise<VersionedResult<TrainingPlanSummary>> {
    this.logger.log('TrainingPlanService -> updateGlobal -> params:', {
      params: { expectedVersion, fields: Object.keys(changes), trainingPlanId },
    });
    const repositoryResult = await this.trainingPlanRepository.updateGlobal(
      trainingPlanId,
      expectedVersion,
      changes,
    );
    if (repositoryResult === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
      );
      return failure;
    }
    const result = {
      data: this.toSummary(repositoryResult.data),
      version: repositoryResult.version,
    };
    this.logger.log('TrainingPlanService -> updateGlobal -> return:', {
      data: { trainingPlanId, version: result.version },
    });
    return result;
  }

  async deleteGlobal(
    trainingPlanId: string,
    expectedVersion: number,
  ): Promise<void> {
    this.logger.log('TrainingPlanService -> deleteGlobal -> params:', {
      params: { expectedVersion, trainingPlanId },
    });
    const images = await this.trainingPlanRepository.deleteGlobal(
      trainingPlanId,
      expectedVersion,
    );
    if (images === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
      );
      return failure;
    }
    await this.exerciseImageService.deleteImages(images);
    this.logger.log('TrainingPlanService -> deleteGlobal -> completed:', {
      data: { imageCount: images.length, trainingPlanId },
    });
  }

  async createWorkout(
    trainingPlanId: string,
    expectedVersion: number,
  ): Promise<VersionedResult<TrainingPlanWorkoutSummary>> {
    this.logger.log('TrainingPlanService -> createWorkout -> params:', {
      params: { expectedVersion, trainingPlanId },
    });
    const state =
      await this.trainingPlanRepository.inspectTarget(trainingPlanId);
    this.assertState(state, expectedVersion, trainingPlanId);
    this.assertAggregateCapacity(state);
    if ((state.workoutCount ?? 0) >= MAX_WORKOUTS_PER_PLAN)
      throw createWorkoutLimitException();
    const result = await this.trainingPlanRepository.createWorkout(
      trainingPlanId,
      expectedVersion,
      DEFAULT_WORKOUT_NAME,
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
      );
      return failure;
    }
    this.logger.log('TrainingPlanService -> createWorkout -> return:', {
      data: {
        trainingPlanId,
        version: result.version,
        workoutId: result.data.id,
      },
    });
    return result;
  }

  async deleteWorkout(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
  ): Promise<number> {
    this.logger.log('TrainingPlanService -> deleteWorkout -> params:', {
      params: { expectedVersion, trainingPlanId, workoutId },
    });
    const result = await this.trainingPlanRepository.deleteWorkout(
      trainingPlanId,
      workoutId,
      expectedVersion,
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
      );
      return failure;
    }
    await this.exerciseImageService.deleteImages(result.data);
    this.logger.log('TrainingPlanService -> deleteWorkout -> return:', {
      data: { trainingPlanId, version: result.version, workoutId },
    });
    return result.version;
  }

  async getWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<WorkoutAggregate> {
    this.logger.log('TrainingPlanService -> getWorkout -> params:', {
      params: { trainingPlanId, workoutId },
    });
    const result = await this.trainingPlanRepository.findWorkout(
      trainingPlanId,
      workoutId,
    );
    if (result === null) {
      const state = await this.trainingPlanRepository.inspectTarget(
        trainingPlanId,
        workoutId,
      );
      this.assertState(state, state.version ?? 0, workoutId);
      throw createWorkoutNotFoundException();
    }
    const metrics = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
    );
    this.warnIfAggregateNearLimit(trainingPlanId, metrics);
    this.logger.log('TrainingPlanService -> getWorkout -> return:', {
      data: {
        exerciseCount: result.exercises.length,
        trainingPlanId,
        version: result.version,
        workoutId,
      },
    });
    return result;
  }

  async updateWorkoutName(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    name: string,
  ): Promise<VersionedResult<WorkoutNameResult>> {
    const result = await this.trainingPlanRepository.updateWorkoutName(
      trainingPlanId,
      workoutId,
      expectedVersion,
      name,
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
      );
      return failure;
    }
    return result;
  }

  async createExercise(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    type: ExerciseType,
  ): Promise<VersionedResult<StoredExercise>> {
    this.logger.log('TrainingPlanService -> createExercise -> params:', {
      params: { expectedVersion, trainingPlanId, type, workoutId },
    });
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
    );
    this.assertState(state, expectedVersion, workoutId);
    this.assertAggregateCapacity(state);
    if ((state.exerciseCount ?? 0) >= MAX_EXERCISES_PER_WORKOUT)
      throw createExerciseLimitException();
    const exercise = this.createDefaultExercise(type);
    const repositoryResult = await this.trainingPlanRepository.createExercise(
      trainingPlanId,
      workoutId,
      expectedVersion,
      exercise,
    );
    if (repositoryResult === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
      );
      return failure;
    }
    this.logger.log('TrainingPlanService -> createExercise -> return:', {
      data: {
        exerciseId: repositoryResult.data.id,
        trainingPlanId,
        version: repositoryResult.version,
        workoutId,
      },
    });
    return repositoryResult;
  }

  async updateExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    changes: UpdateExerciseRequest,
  ): Promise<VersionedResult<StoredExercise>> {
    const definedChanges = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    ) as UpdateExerciseRequest;
    this.logger.log('TrainingPlanService -> updateExercise -> params:', {
      params: {
        exerciseId,
        expectedVersion,
        fields: Object.keys(definedChanges),
        trainingPlanId,
        workoutId,
      },
    });
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    this.assertState(
      state,
      expectedVersion,
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    this.assertAggregateCapacity(state);
    const type = state.exerciseType;
    if (
      type === undefined ||
      Object.keys(definedChanges).some(
        (field) => !editableFields[type].has(field),
      )
    )
      throw createInvalidExerciseTypeException();
    const normalized = { ...definedChanges };
    if ('youtubeId' in normalized && normalized.youtubeId !== undefined)
      normalized.youtubeId =
        await this.youtubeReferenceService.normalizeAndValidate(
          normalized.youtubeId,
        );
    const repositoryResult = await this.trainingPlanRepository.updateExercise(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      normalized,
    );
    if (repositoryResult === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
      );
      return failure;
    }
    this.logger.log('TrainingPlanService -> updateExercise -> return:', {
      data: {
        exerciseId,
        trainingPlanId,
        version: repositoryResult.version,
        workoutId,
      },
    });
    return repositoryResult;
  }

  async deleteExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<number> {
    const result = await this.trainingPlanRepository.deleteExercise(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
      );
      return failure;
    }
    if (result.data !== null)
      await this.exerciseImageService.deleteImages([result.data]);
    return result.version;
  }

  async reorderExercises(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exerciseIds: readonly string[],
  ): Promise<number> {
    const workout = await this.trainingPlanRepository.findWorkout(
      trainingPlanId,
      workoutId,
    );
    if (workout === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
      );
      return failure;
    }
    if (workout.version !== expectedVersion) {
      this.logger.warn(
        'TrainingPlanService -> reorderExercises -> versionConflict branch:',
        {
          data: {
            actualVersion: workout.version,
            expectedVersion,
            trainingPlanId,
            workoutId,
          },
        },
      );
      throw createVersionConflictException();
    }
    const currentIds = workout.exercises.map((exercise) => exercise.id);
    const unique = new Set(exerciseIds);
    if (
      unique.size !== exerciseIds.length ||
      exerciseIds.length !== currentIds.length ||
      currentIds.some((id) => !unique.has(id))
    )
      throw createInvalidExerciseOrderException();
    const result = await this.trainingPlanRepository.reorderExercises(
      trainingPlanId,
      workoutId,
      expectedVersion,
      exerciseIds,
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
      );
      return failure;
    }
    return result.version;
  }

  async validateExerciseImageUpload(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<void> {
    this.logger.log(
      'TrainingPlanService -> validateExerciseImageUpload -> params:',
      {
        params: { exerciseId, expectedVersion, trainingPlanId, workoutId },
      },
    );
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    this.assertState(
      state,
      expectedVersion,
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    this.assertAggregateCapacity(state);
    if (state.exerciseType !== 'image')
      throw createInvalidExerciseTypeException();
    this.logger.log(
      'TrainingPlanService -> validateExerciseImageUpload -> completed:',
      { data: { exerciseId, trainingPlanId, workoutId } },
    );
  }

  async commitExerciseImage(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    image: StoredExerciseImage,
  ): Promise<number> {
    this.logger.log('TrainingPlanService -> commitExerciseImage -> params:', {
      params: { exerciseId, expectedVersion, trainingPlanId, workoutId },
    });
    const result = await this.trainingPlanRepository.updateExerciseImage(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      { image },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
      );
      return failure;
    }
    if (result.data !== null)
      await this.exerciseImageService.deleteImages([result.data]);
    this.logger.log('TrainingPlanService -> commitExerciseImage -> return:', {
      data: { exerciseId, trainingPlanId, version: result.version, workoutId },
    });
    return result.version;
  }

  async removeExerciseImage(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<number> {
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    this.assertState(
      state,
      expectedVersion,
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    if (state.exerciseType !== 'image')
      throw createInvalidExerciseTypeException();
    const result = await this.trainingPlanRepository.updateExerciseImage(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      { image: null },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
      );
      return failure;
    }
    if (result.data !== null)
      await this.exerciseImageService.deleteImages([result.data]);
    return result.version;
  }

  private async throwMutationFailure(
    trainingPlanId: string,
    expectedVersion: number,
    workoutId?: string,
    exerciseId?: string,
  ): Promise<never> {
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    this.assertState(
      state,
      expectedVersion,
      trainingPlanId,
      workoutId,
      exerciseId,
    );
    throw createVersionConflictException();
  }

  private assertState(
    state: TargetState,
    expectedVersion: number,
    trainingPlanId: string,
    workoutId?: string,
    exerciseId?: string,
  ): void {
    if (!state.trainingPlanExists) throw createTrainingPlanNotFoundException();
    if (workoutId !== undefined && !state.workoutExists)
      throw createWorkoutNotFoundException();
    if (exerciseId !== undefined && !state.exerciseExists)
      throw createExerciseNotFoundException();
    if (state.version !== expectedVersion) {
      this.logger.warn(
        'TrainingPlanService -> assertState -> versionConflict branch:',
        {
          data: {
            actualVersion: state.version,
            expectedVersion,
            exerciseId,
            trainingPlanId,
            workoutId,
          },
        },
      );
      throw createVersionConflictException();
    }
  }

  private assertAggregateCapacity(state: TargetState): void {
    if ((state.bsonSize ?? 0) >= TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT)
      throw createTrainingPlanSizeLimitException();
  }

  private warnIfAggregateNearLimit(
    trainingPlanId: string,
    state: TargetState,
  ): void {
    if (
      (state.bsonSize ?? 0) < TRAINING_PLAN_SIZE_WARNING &&
      (state.workoutCount ?? 0) < TRAINING_PLAN_WORKOUT_WARNING &&
      (state.maxExerciseCount ?? 0) < TRAINING_PLAN_EXERCISE_WARNING
    )
      return;
    this.logger.warn(
      'TrainingPlanService -> warnIfAggregateNearLimit -> aggregateNearLimit:',
      {
        data: {
          bsonSize: state.bsonSize,
          maxExerciseCount: state.maxExerciseCount,
          trainingPlanId,
          workoutCount: state.workoutCount,
        },
      },
    );
  }

  private createDefaultExercise(type: ExerciseType): StoredExercise {
    const id = randomBytes(12).toString('hex');
    let result: StoredExercise;
    switch (type) {
      case 'youtube-short':
        result = {
          id,
          type,
          name: 'Novo exercício',
          youtubeId: 'ZA8gs8XP2bs',
          bodyArea: 'other',
          restSeconds: 60,
          sets: 3,
          repetitions: 12,
        };
        break;
      case 'image':
        result = {
          id,
          type,
          name: 'Novo exercício',
          image: null,
          bodyArea: 'other',
          restSeconds: 60,
          sets: 3,
          repetitions: 12,
        };
        break;
      case 'youtube-long':
        result = {
          id,
          type,
          name: 'Novo exercício',
          youtubeId: '2isq0vuKruE',
          bodyArea: 'other',
        };
        break;
      case 'pause':
        result = { id, type, restSeconds: 60 };
        break;
      case 'duration':
        result = {
          id,
          type,
          name: 'Novo exercício',
          bodyArea: 'other',
          durationMinutes: 15,
        };
        break;
    }
    return result;
  }

  private toSummary(plan: TrainingPlanEntity): TrainingPlanSummary {
    const result = {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      version: plan.version,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
    return result;
  }
}
