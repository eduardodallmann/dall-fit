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

import { RealtimePublisherService } from '~/realtime/realtime-publisher.service';
import type {
  StoredExercise,
  StoredExerciseImage,
  TargetState,
  TrainingPlanEntity,
  TrainingPlanExecutionTree,
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
import { TrainingLoadProfileService } from '~/training/services/training-load-profile.service';

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
    private readonly realtimePublisher: RealtimePublisherService,
    private readonly trainingLoadProfiles: TrainingLoadProfileService,
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
    await this.publishPresent(result.id, result.version);
    this.logger.log('TrainingPlanService -> createGlobal -> return:', {
      data: { trainingPlanId: result.id, version: result.version },
    });
    return result;
  }

  async createOwned(
    ownerPersonId: string,
    input: CreateTrainingPlanRequest,
  ): Promise<TrainingPlanEntity> {
    this.logger.log('TrainingPlanService -> createOwned -> params:', {
      params: { fields: Object.keys(input), ownerPersonId },
    });
    const result = await this.trainingPlanRepository.create({
      ...input,
      ownerPersonId,
    });
    this.logger.log('TrainingPlanService -> createOwned -> return:', {
      data: {
        ownerPersonId,
        trainingPlanId: result.id,
        version: result.version,
      },
    });
    return result;
  }

  async getOwned(
    ownerPersonId: string,
    trainingPlanId: string,
  ): Promise<TrainingPlanEntity> {
    this.logger.log('TrainingPlanService -> getOwned -> params:', {
      params: { ownerPersonId, trainingPlanId },
    });
    const result = await this.trainingPlanRepository.findById(trainingPlanId, {
      ownerPersonId,
    });
    if (result === null) throw createTrainingPlanNotFoundException();
    this.logger.log('TrainingPlanService -> getOwned -> return:', {
      data: { ownerPersonId, trainingPlanId, version: result.version },
    });
    return result;
  }

  async updateOwned(
    ownerPersonId: string,
    trainingPlanId: string,
    expectedVersion: number,
    changes: UpdateTrainingPlanRequest,
  ): Promise<VersionedResult<TrainingPlanSummary>> {
    this.logger.log('TrainingPlanService -> updateOwned -> params:', {
      params: {
        expectedVersion,
        fields: Object.keys(changes),
        ownerPersonId,
        trainingPlanId,
      },
    });
    const repositoryResult = await this.trainingPlanRepository.update(
      trainingPlanId,
      expectedVersion,
      changes,
      { ownerPersonId },
    );
    if (repositoryResult === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        undefined,
        undefined,
        ownerPersonId,
      );
      return failure;
    }
    const result = {
      data: this.toSummary(repositoryResult.data),
      version: repositoryResult.version,
    };
    this.logger.log('TrainingPlanService -> updateOwned -> return:', {
      data: { ownerPersonId, trainingPlanId, version: result.version },
    });
    return result;
  }

  async deleteOwned(
    ownerPersonId: string,
    trainingPlanId: string,
    expectedVersion: number,
  ): Promise<void> {
    this.logger.log('TrainingPlanService -> deleteOwned -> params:', {
      params: { expectedVersion, ownerPersonId, trainingPlanId },
    });
    const images = await this.trainingPlanRepository.delete(
      trainingPlanId,
      expectedVersion,
      { ownerPersonId },
    );
    if (images === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        undefined,
        undefined,
        ownerPersonId,
      );
      return failure;
    }
    await this.exerciseImageService.deleteImages(images);
    await this.trainingLoadProfiles.cleanupPlan(trainingPlanId);
    this.logger.log('TrainingPlanService -> deleteOwned -> completed:', {
      data: { imageCount: images.length, ownerPersonId, trainingPlanId },
    });
  }

  async getGlobal(trainingPlanId: string): Promise<TrainingPlanEntity> {
    this.logger.log('TrainingPlanService -> getGlobal -> params:', {
      params: { trainingPlanId },
    });
    const result = await this.trainingPlanRepository.findById(trainingPlanId, {
      ownerPersonId: null,
    });
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
    const repositoryResult = await this.trainingPlanRepository.update(
      trainingPlanId,
      expectedVersion,
      changes,
      { ownerPersonId: null },
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
    if (result.version > expectedVersion)
      await this.publishPresent(trainingPlanId, result.version);
    this.logger.log('TrainingPlanService -> updateGlobal -> return:', {
      data: { trainingPlanId, version: result.version },
    });
    return result;
  }

  async deleteGlobal(
    trainingPlanId: string,
    expectedVersion: number,
    retainedImageKeys: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    this.logger.log('TrainingPlanService -> deleteGlobal -> params:', {
      params: { expectedVersion, trainingPlanId },
    });
    const images = await this.trainingPlanRepository.delete(
      trainingPlanId,
      expectedVersion,
      { ownerPersonId: null },
    );
    if (images === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
      );
      return failure;
    }
    await this.publishDeleted(trainingPlanId);
    const deletableImages = images.filter(
      (image) =>
        !retainedImageKeys.has(image.thumbnail.key) &&
        !retainedImageKeys.has(image.display.key),
    );
    await this.exerciseImageService.deleteImages(deletableImages);
    await this.trainingLoadProfiles.cleanupPlan(trainingPlanId);
    this.logger.log('TrainingPlanService -> deleteGlobal -> completed:', {
      data: {
        deletedImageCount: deletableImages.length,
        retainedImageCount: images.length - deletableImages.length,
        trainingPlanId,
      },
    });
  }

  async createWorkout(
    trainingPlanId: string,
    expectedVersion: number,
    ownerPersonId: string | null = null,
  ): Promise<VersionedResult<TrainingPlanWorkoutSummary>> {
    this.logger.log('TrainingPlanService -> createWorkout -> params:', {
      params: { expectedVersion, trainingPlanId },
    });
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      undefined,
      undefined,
      { ownerPersonId },
    );
    this.assertState(state, expectedVersion, trainingPlanId);
    this.assertAggregateCapacity(state);
    if ((state.workoutCount ?? 0) >= MAX_WORKOUTS_PER_PLAN)
      throw createWorkoutLimitException();
    const result = await this.trainingPlanRepository.createWorkout(
      trainingPlanId,
      expectedVersion,
      DEFAULT_WORKOUT_NAME,
      { ownerPersonId },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        undefined,
        undefined,
        ownerPersonId,
      );
      return failure;
    }
    await this.publishScopedPresent(
      trainingPlanId,
      result.version,
      ownerPersonId,
    );
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
    ownerPersonId: string | null = null,
  ): Promise<number> {
    this.logger.log('TrainingPlanService -> deleteWorkout -> params:', {
      params: { expectedVersion, trainingPlanId, workoutId },
    });
    const result = await this.trainingPlanRepository.deleteWorkout(
      trainingPlanId,
      workoutId,
      expectedVersion,
      { ownerPersonId },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        undefined,
        ownerPersonId,
      );
      return failure;
    }
    if (result.version > expectedVersion)
      await this.publishScopedPresent(
        trainingPlanId,
        result.version,
        ownerPersonId,
      );
    await this.exerciseImageService.deleteImages(result.data);
    await this.trainingLoadProfiles.cleanupWorkout(trainingPlanId, workoutId);
    this.logger.log('TrainingPlanService -> deleteWorkout -> return:', {
      data: { trainingPlanId, version: result.version, workoutId },
    });
    return result.version;
  }

  async getWorkout(
    trainingPlanId: string,
    workoutId: string,
    ownerPersonId: string | null = null,
  ): Promise<WorkoutAggregate> {
    this.logger.log('TrainingPlanService -> getWorkout -> params:', {
      params: { trainingPlanId, workoutId },
    });
    const result = await this.trainingPlanRepository.findWorkout(
      trainingPlanId,
      workoutId,
      { ownerPersonId },
    );
    if (result === null) {
      const state = await this.trainingPlanRepository.inspectTarget(
        trainingPlanId,
        workoutId,
        undefined,
        { ownerPersonId },
      );
      this.assertState(state, state.version ?? 0, workoutId);
      throw createWorkoutNotFoundException();
    }
    const metrics = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      undefined,
      { ownerPersonId },
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

  async getExecutionTree(
    trainingPlanId: string,
    ownerPersonId: string | null,
  ): Promise<TrainingPlanExecutionTree> {
    this.logger.log('TrainingPlanService -> getExecutionTree -> params:', {
      params: { ownerIsGlobal: ownerPersonId === null, trainingPlanId },
    });
    const tree = await this.findExecutionTree(trainingPlanId, ownerPersonId);
    if (tree === null) throw createTrainingPlanNotFoundException();
    const result = tree;
    this.logger.log('TrainingPlanService -> getExecutionTree -> return:', {
      data: { trainingPlanId, workoutCount: result.workouts.length },
    });
    return result;
  }

  async findExecutionTree(
    trainingPlanId: string,
    ownerPersonId: string | null,
  ): Promise<TrainingPlanExecutionTree | null> {
    this.logger.log('TrainingPlanService -> findExecutionTree -> params:', {
      params: { ownerIsGlobal: ownerPersonId === null, trainingPlanId },
    });
    const result = await this.trainingPlanRepository.findExecutionTree(
      trainingPlanId,
      { ownerPersonId },
    );
    this.logger.log(
      'TrainingPlanService -> findExecutionTree -> repository return:',
      { data: { found: result !== null, trainingPlanId } },
    );
    this.logger.log('TrainingPlanService -> findExecutionTree -> return:', {
      data: { found: result !== null, trainingPlanId },
    });
    return result;
  }

  async updateWorkoutName(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    name: string,
    ownerPersonId: string | null = null,
  ): Promise<VersionedResult<WorkoutNameResult>> {
    const result = await this.trainingPlanRepository.updateWorkoutName(
      trainingPlanId,
      workoutId,
      expectedVersion,
      name,
      { ownerPersonId },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        undefined,
        ownerPersonId,
      );
      return failure;
    }
    if (result.version > expectedVersion)
      await this.publishScopedPresent(
        trainingPlanId,
        result.version,
        ownerPersonId,
      );
    return result;
  }

  async createExercise(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    type: ExerciseType,
    ownerPersonId: string | null = null,
  ): Promise<VersionedResult<StoredExercise>> {
    this.logger.log('TrainingPlanService -> createExercise -> params:', {
      params: { expectedVersion, trainingPlanId, type, workoutId },
    });
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      undefined,
      { ownerPersonId },
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
      { ownerPersonId },
    );
    if (repositoryResult === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        undefined,
        ownerPersonId,
      );
      return failure;
    }
    await this.publishScopedPresent(
      trainingPlanId,
      repositoryResult.version,
      ownerPersonId,
    );
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
    ownerPersonId: string | null = null,
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
      { ownerPersonId },
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
      { ownerPersonId },
    );
    if (repositoryResult === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
        ownerPersonId,
      );
      return failure;
    }
    if (repositoryResult.version > expectedVersion)
      await this.publishScopedPresent(
        trainingPlanId,
        repositoryResult.version,
        ownerPersonId,
      );
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
    ownerPersonId: string | null = null,
  ): Promise<number> {
    const result = await this.trainingPlanRepository.deleteExercise(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      { ownerPersonId },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
        ownerPersonId,
      );
      return failure;
    }
    if (result.version > expectedVersion)
      await this.publishScopedPresent(
        trainingPlanId,
        result.version,
        ownerPersonId,
      );
    if (result.data !== null)
      await this.exerciseImageService.deleteImages([result.data]);
    await this.trainingLoadProfiles.cleanupExercise(trainingPlanId, exerciseId);
    return result.version;
  }

  async reorderExercises(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exerciseIds: readonly string[],
    ownerPersonId: string | null = null,
  ): Promise<number> {
    const workout = await this.trainingPlanRepository.findWorkout(
      trainingPlanId,
      workoutId,
      { ownerPersonId },
    );
    if (workout === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        undefined,
        ownerPersonId,
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
      { ownerPersonId },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        undefined,
        ownerPersonId,
      );
      return failure;
    }
    if (result.version > expectedVersion)
      await this.publishScopedPresent(
        trainingPlanId,
        result.version,
        ownerPersonId,
      );
    return result.version;
  }

  async validateExerciseImageUpload(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    ownerPersonId: string | null = null,
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
      { ownerPersonId },
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
    ownerPersonId: string | null = null,
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
      { ownerPersonId },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
        ownerPersonId,
      );
      return failure;
    }
    if (result.version > expectedVersion)
      await this.publishScopedPresent(
        trainingPlanId,
        result.version,
        ownerPersonId,
      );
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
    ownerPersonId: string | null = null,
  ): Promise<number> {
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      exerciseId,
      { ownerPersonId },
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
      { ownerPersonId },
    );
    if (result === null) {
      const failure = this.throwMutationFailure(
        trainingPlanId,
        expectedVersion,
        workoutId,
        exerciseId,
        ownerPersonId,
      );
      return failure;
    }
    if (result.version > expectedVersion)
      await this.publishScopedPresent(
        trainingPlanId,
        result.version,
        ownerPersonId,
      );
    if (result.data !== null)
      await this.exerciseImageService.deleteImages([result.data]);
    return result.version;
  }

  private async throwMutationFailure(
    trainingPlanId: string,
    expectedVersion: number,
    workoutId?: string,
    exerciseId?: string,
    ownerPersonId: string | null = null,
  ): Promise<never> {
    const state = await this.trainingPlanRepository.inspectTarget(
      trainingPlanId,
      workoutId,
      exerciseId,
      { ownerPersonId },
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

  private async publishPresent(
    trainingPlanId: string,
    version: number,
  ): Promise<void> {
    this.logger.log('TrainingPlanService -> publishPresent -> params:', {
      params: { trainingPlanId, version },
    });
    await this.realtimePublisher.publish({
      resource: 'global-training-plan',
      resourceId: trainingPlanId,
      state: 'present',
      version,
    });
    this.logger.log('TrainingPlanService -> publishPresent -> completed:', {
      data: { trainingPlanId, version },
    });
  }

  private async publishScopedPresent(
    trainingPlanId: string,
    version: number,
    ownerPersonId: string | null,
  ): Promise<void> {
    this.logger.log('TrainingPlanService -> publishScopedPresent -> params:', {
      params: {
        ownerIsGlobal: ownerPersonId === null,
        trainingPlanId,
        version,
      },
    });
    if (ownerPersonId === null)
      await this.publishPresent(trainingPlanId, version);
    this.logger.log(
      'TrainingPlanService -> publishScopedPresent -> completed:',
      {
        data: {
          ownerIsGlobal: ownerPersonId === null,
          trainingPlanId,
          version,
        },
      },
    );
  }

  private async publishDeleted(trainingPlanId: string): Promise<void> {
    this.logger.log('TrainingPlanService -> publishDeleted -> params:', {
      params: { trainingPlanId },
    });
    await this.realtimePublisher.publish({
      resource: 'global-training-plan',
      resourceId: trainingPlanId,
      state: 'deleted',
    });
    this.logger.log('TrainingPlanService -> publishDeleted -> completed:', {
      data: { trainingPlanId },
    });
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
