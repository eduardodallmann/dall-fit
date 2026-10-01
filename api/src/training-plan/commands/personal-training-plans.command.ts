import { Injectable, Logger } from '@nestjs/common';

import type {
  CreateExerciseResponse,
  CreateTrainingPlanRequest,
  CreateTrainingPlanWorkoutResponse,
  ExerciseType,
  GlobalTrainingPlanLibraryResponse,
  PersonalTrainingPlanCollectionResponse,
  PersonalTrainingPlanDetailsResponse,
  ReorderExercisesRequest,
  TrainingPlanCloneJobResponse,
  TrainingPlanWorkoutDetailsResponse,
  UpdateExerciseImageResponse,
  UpdateExerciseRequest,
  UpdateExerciseResponse,
  UpdateTrainingPlanRequest,
  UpdateTrainingPlanResponse,
  UpdateTrainingPlanWorkoutResponse,
} from '@dall-fit/types';

import type { UploadedImageFile } from '~/training-plan/domain/training-plan.entity';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class PersonalTrainingPlansCommand {
  private readonly logger = new Logger(PersonalTrainingPlansCommand.name);

  constructor(
    private readonly personalService: PersonalTrainingPlanService,
    private readonly trainingPlanService: TrainingPlanService,
    private readonly exerciseImageService: ExerciseImageService,
  ) {}

  async list(
    personId: string,
    page: number,
  ): Promise<PersonalTrainingPlanCollectionResponse> {
    this.logParams('list', { page, personId });
    const result = await this.personalService.list(personId, page);
    this.logReturn('list', {
      count: result.data.length,
      personId,
      total: result.total,
    });
    return result;
  }

  async library(
    personId: string,
    page: number,
  ): Promise<GlobalTrainingPlanLibraryResponse> {
    this.logParams('library', { page, personId });
    const result = await this.personalService.listLibrary(personId, page);
    this.logReturn('library', {
      count: result.data.length,
      personId,
      total: result.total,
    });
    return result;
  }

  async create(personId: string, input: CreateTrainingPlanRequest) {
    this.logParams('create', { fields: Object.keys(input), personId });
    const data = await this.personalService.createOwned(personId, input);
    const result = { data };
    this.logReturn('create', {
      catalogEntryId:
        data.itemType === 'training-plan' ? data.catalogEntryId : undefined,
      personId,
    });
    return result;
  }

  async createReference(personId: string, globalTrainingPlanId: string) {
    this.logParams('createReference', { globalTrainingPlanId, personId });
    const data = await this.personalService.createGlobalReference(
      personId,
      globalTrainingPlanId,
    );
    const result = { data };
    this.logReturn('createReference', { globalTrainingPlanId, personId });
    return result;
  }

  async activate(personId: string, catalogEntryId: string, active: boolean) {
    this.logParams('activate', { active, catalogEntryId, personId });
    const activeCatalogEntryIds = await this.personalService.setActiveState(
      personId,
      catalogEntryId,
      active,
    );
    const result = { data: { activeCatalogEntryIds } };
    this.logReturn('activate', {
      activeCount: activeCatalogEntryIds.length,
      personId,
    });
    return result;
  }

  async get(
    personId: string,
    catalogEntryId: string,
  ): Promise<PersonalTrainingPlanDetailsResponse> {
    this.logParams('get', { catalogEntryId, personId });
    const data = await this.personalService.getDetails(
      personId,
      catalogEntryId,
    );
    const result = { data };
    this.logReturn('get', { catalogEntryId, personId, source: data.source });
    return result;
  }

  async update(
    personId: string,
    catalogEntryId: string,
    expectedVersion: number,
    changes: UpdateTrainingPlanRequest,
  ): Promise<{ response: UpdateTrainingPlanResponse; version: number }> {
    this.logParams('update', {
      catalogEntryId,
      expectedVersion,
      fields: Object.keys(changes),
      personId,
    });
    const updated = await this.personalService.updateOwned(
      personId,
      catalogEntryId,
      expectedVersion,
      changes,
    );
    if (updated.data.itemType !== 'training-plan')
      throw new Error('Owned training plan update returned an invalid item.');
    const result = {
      response: {
        data: {
          createdAt: updated.data.createdAt,
          description: updated.data.description,
          id: updated.data.id,
          name: updated.data.name,
          updatedAt: updated.data.updatedAt,
          version: updated.version,
        },
      },
      version: updated.version,
    };
    this.logReturn('update', {
      catalogEntryId,
      personId,
      version: result.version,
    });
    return result;
  }

  async delete(
    personId: string,
    catalogEntryId: string,
    expectedVersion?: number,
  ): Promise<void> {
    this.logParams('delete', {
      catalogEntryId,
      expectedVersionPresent: expectedVersion !== undefined,
      personId,
    });
    await this.personalService.deleteCatalogItem(
      personId,
      catalogEntryId,
      expectedVersion,
    );
    this.logReturn('delete', { catalogEntryId, personId });
  }

  async getWorkout(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
  ): Promise<TrainingPlanWorkoutDetailsResponse> {
    this.logParams('getWorkout', { catalogEntryId, personId, workoutId });
    const data = await this.personalService.getWorkout(
      personId,
      catalogEntryId,
      workoutId,
    );
    const result = { data };
    this.logReturn('getWorkout', { catalogEntryId, personId, workoutId });
    return result;
  }

  async createWorkout(
    personId: string,
    catalogEntryId: string,
    expectedVersion: number,
  ): Promise<{ response: CreateTrainingPlanWorkoutResponse; version: number }> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const created = await this.trainingPlanService.createWorkout(
      trainingPlanId,
      expectedVersion,
      personId,
    );
    const result = {
      response: { data: created.data },
      version: created.version,
    };
    this.logReturn('createWorkout', {
      catalogEntryId,
      personId,
      version: result.version,
    });
    return result;
  }

  async updateWorkout(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    expectedVersion: number,
    name: string,
  ): Promise<{ response: UpdateTrainingPlanWorkoutResponse; version: number }> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const updated = await this.trainingPlanService.updateWorkoutName(
      trainingPlanId,
      workoutId,
      expectedVersion,
      name,
      personId,
    );
    const result = {
      response: { data: updated.data },
      version: updated.version,
    };
    this.logReturn('updateWorkout', {
      catalogEntryId,
      personId,
      version: result.version,
      workoutId,
    });
    return result;
  }

  async deleteWorkout(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    expectedVersion: number,
  ): Promise<number> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const result = await this.trainingPlanService.deleteWorkout(
      trainingPlanId,
      workoutId,
      expectedVersion,
      personId,
    );
    this.logReturn('deleteWorkout', {
      catalogEntryId,
      personId,
      version: result,
      workoutId,
    });
    return result;
  }

  async createExercise(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    expectedVersion: number,
    type: ExerciseType,
  ): Promise<{ response: CreateExerciseResponse; version: number }> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const created = await this.trainingPlanService.createExercise(
      trainingPlanId,
      workoutId,
      expectedVersion,
      type,
      personId,
    );
    const exercise = await this.exerciseImageService.toPublicExercise(
      created.data,
    );
    const result = { response: { data: exercise }, version: created.version };
    this.logReturn('createExercise', {
      catalogEntryId,
      exerciseId: exercise.id,
      personId,
      version: result.version,
    });
    return result;
  }

  async updateExercise(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    changes: UpdateExerciseRequest,
  ): Promise<{ response: UpdateExerciseResponse; version: number }> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const updated = await this.trainingPlanService.updateExercise(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      changes,
      personId,
    );
    const exercise = await this.exerciseImageService.toPublicExercise(
      updated.data,
    );
    const result = { response: { data: exercise }, version: updated.version };
    this.logReturn('updateExercise', {
      catalogEntryId,
      exerciseId,
      personId,
      version: result.version,
    });
    return result;
  }

  async deleteExercise(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<number> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const result = await this.trainingPlanService.deleteExercise(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      personId,
    );
    this.logReturn('deleteExercise', {
      catalogEntryId,
      exerciseId,
      personId,
      version: result,
    });
    return result;
  }

  async reorderExercises(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    expectedVersion: number,
    input: ReorderExercisesRequest,
  ): Promise<number> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const result = await this.trainingPlanService.reorderExercises(
      trainingPlanId,
      workoutId,
      expectedVersion,
      input.exerciseIds,
      personId,
    );
    this.logReturn('reorderExercises', {
      catalogEntryId,
      personId,
      version: result,
      workoutId,
    });
    return result;
  }

  async uploadImage(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    file: UploadedImageFile,
  ): Promise<{ response: UpdateExerciseImageResponse; version: number }> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    await this.trainingPlanService.validateExerciseImageUpload(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      personId,
    );
    const storedImage = await this.exerciseImageService.processAndUpload(file);
    let committed = false;
    try {
      const image =
        await this.exerciseImageService.createSignedImage(storedImage);
      const version = await this.trainingPlanService.commitExerciseImage(
        trainingPlanId,
        workoutId,
        exerciseId,
        expectedVersion,
        storedImage,
        personId,
      );
      committed = true;
      const result = { response: { data: { image } }, version };
      this.logReturn('uploadImage', {
        catalogEntryId,
        exerciseId,
        personId,
        version,
      });
      return result;
    } finally {
      if (!committed)
        await this.exerciseImageService.deleteImages([storedImage]);
    }
  }

  async removeImage(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<number> {
    const trainingPlanId =
      await this.personalService.resolveOwnedTrainingPlanId(
        personId,
        catalogEntryId,
      );
    const result = await this.trainingPlanService.removeExerciseImage(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      personId,
    );
    this.logReturn('removeImage', {
      catalogEntryId,
      exerciseId,
      personId,
      version: result,
    });
    return result;
  }

  async startClone(
    personId: string,
    globalTrainingPlanId: string,
  ): Promise<TrainingPlanCloneJobResponse> {
    const data = await this.personalService.startClone(
      personId,
      globalTrainingPlanId,
    );
    const result = { data };
    this.logReturn('startClone', { cloneJobId: data.cloneJobId, personId });
    return result;
  }

  async retryClone(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJobResponse> {
    const data = await this.personalService.retryClone(personId, cloneJobId);
    const result = { data };
    this.logReturn('retryClone', { cloneJobId, personId });
    return result;
  }

  async cancelClone(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJobResponse> {
    const data = await this.personalService.cancelClone(personId, cloneJobId);
    const result = { data };
    this.logReturn('cancelClone', { cloneJobId, personId });
    return result;
  }

  private logParams(method: string, params: Record<string, unknown>): void {
    this.logger.log(`PersonalTrainingPlansCommand -> ${method} -> params:`, {
      params,
    });
  }

  private logReturn(method: string, data: Record<string, unknown>): void {
    this.logger.log(`PersonalTrainingPlansCommand -> ${method} -> return:`, {
      data,
    });
  }
}
