import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import type {
  CreateExerciseResponse,
  CreateTrainingPlanResponse,
  CreateTrainingPlanWorkoutResponse,
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetailsResponse,
  TrainingPlanWorkoutDetailsResponse,
  UpdateExerciseImageResponse,
  UpdateExerciseResponse,
  UpdateTrainingPlanResponse,
  UpdateTrainingPlanWorkoutResponse,
} from '@dall-fit/types';

import { AdminOnly } from '~/auth/decorators/admin-only';
import {
  AdminMutation,
  EditorMutation,
  ImageMutation,
} from '~/auth/decorators/authenticated-mutation';
import { CreateGlobalTrainingPlanCommand } from '~/training-plan/commands/create-global-training-plan.command';
import { CreateTrainingPlanExerciseCommand } from '~/training-plan/commands/create-training-plan-exercise.command';
import { CreateTrainingPlanWorkoutCommand } from '~/training-plan/commands/create-training-plan-workout.command';
import { DeleteGlobalTrainingPlanCommand } from '~/training-plan/commands/delete-global-training-plan.command';
import { DeleteTrainingPlanExerciseCommand } from '~/training-plan/commands/delete-training-plan-exercise.command';
import { DeleteTrainingPlanWorkoutCommand } from '~/training-plan/commands/delete-training-plan-workout.command';
import { GetGlobalTrainingPlanCommand } from '~/training-plan/commands/get-global-training-plan.command';
import { GetTrainingPlanWorkoutCommand } from '~/training-plan/commands/get-training-plan-workout.command';
import { ListGlobalTrainingPlansCommand } from '~/training-plan/commands/list-global-training-plans.command';
import { RemoveTrainingPlanExerciseImageCommand } from '~/training-plan/commands/remove-training-plan-exercise-image.command';
import { ReorderTrainingPlanExercisesCommand } from '~/training-plan/commands/reorder-training-plan-exercises.command';
import { UpdateGlobalTrainingPlanCommand } from '~/training-plan/commands/update-global-training-plan.command';
import { UpdateTrainingPlanExerciseCommand } from '~/training-plan/commands/update-training-plan-exercise.command';
import { UpdateTrainingPlanWorkoutCommand } from '~/training-plan/commands/update-training-plan-workout.command';
import { UploadTrainingPlanExerciseImageCommand } from '~/training-plan/commands/upload-training-plan-exercise-image.command';
import {
  formatResourceVersion,
  parseResourceVersion,
  RESOURCE_VERSION_HEADER,
} from '~/training-plan/domain/resource-version';
import type { UploadedImageFile } from '~/training-plan/domain/training-plan.entity';
import {
  CreateExerciseDto,
  CreateTrainingPlanDto,
  EmptyTrainingPlanRequestDto,
  ListTrainingPlansQueryDto,
  ReorderExercisesDto,
  TrainingPlanExerciseParamsDto,
  TrainingPlanParamsDto,
  TrainingPlanWorkoutParamsDto,
  UpdateExerciseDto,
  UpdateTrainingPlanDto,
  UpdateTrainingPlanWorkoutDto,
} from '~/training-plan/dto/training-plan.dto';
import { createValidationException } from '~/training-plan/errors/training-plan.errors';

@AdminOnly()
@Controller('global/training-plans')
export class GlobalTrainingPlansController {
  private readonly logger = new Logger(GlobalTrainingPlansController.name);

  constructor(
    private readonly listCommand: ListGlobalTrainingPlansCommand,
    private readonly createCommand: CreateGlobalTrainingPlanCommand,
    private readonly getCommand: GetGlobalTrainingPlanCommand,
    private readonly updateCommand: UpdateGlobalTrainingPlanCommand,
    private readonly deleteCommand: DeleteGlobalTrainingPlanCommand,
    private readonly createWorkoutCommand: CreateTrainingPlanWorkoutCommand,
    private readonly deleteWorkoutCommand: DeleteTrainingPlanWorkoutCommand,
    private readonly getWorkoutCommand: GetTrainingPlanWorkoutCommand,
    private readonly updateWorkoutCommand: UpdateTrainingPlanWorkoutCommand,
    private readonly createExerciseCommand: CreateTrainingPlanExerciseCommand,
    private readonly updateExerciseCommand: UpdateTrainingPlanExerciseCommand,
    private readonly deleteExerciseCommand: DeleteTrainingPlanExerciseCommand,
    private readonly reorderExercisesCommand: ReorderTrainingPlanExercisesCommand,
    private readonly uploadImageCommand: UploadTrainingPlanExerciseImageCommand,
    private readonly removeImageCommand: RemoveTrainingPlanExerciseImageCommand,
  ) {}

  @Get()
  async list(
    @Query() query: ListTrainingPlansQueryDto,
  ): Promise<GlobalTrainingPlanCollectionResponse> {
    this.logger.log('GlobalTrainingPlansController -> list -> params:', {
      params: { page: query.page },
    });
    const result = await this.listCommand.execute(query.page);
    this.logger.log('GlobalTrainingPlansController -> list -> return:', {
      data: { count: result.data.length, total: result.total },
    });
    return result;
  }

  @Post()
  @AdminMutation()
  async create(
    @Body() input: CreateTrainingPlanDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateTrainingPlanResponse> {
    const result = await this.createCommand.execute(input);
    this.setResourceVersion(response, result.data.version);
    return result;
  }

  @Get(':trainingPlanId')
  async get(
    @Param() params: TrainingPlanParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingPlanDetailsResponse> {
    const result = await this.getCommand.execute(params.trainingPlanId);
    this.setResourceVersion(response, result.data.version);
    return result;
  }

  @Patch(':trainingPlanId')
  @AdminMutation()
  async update(
    @Param() params: TrainingPlanParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() changes: UpdateTrainingPlanDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateTrainingPlanResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const result = await this.updateCommand.execute(
      params.trainingPlanId,
      expectedVersion,
      changes,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':trainingPlanId')
  @AdminMutation()
  @HttpCode(204)
  async delete(
    @Param() params: TrainingPlanParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    await this.deleteCommand.execute(params.trainingPlanId, expectedVersion);
  }

  @Post(':trainingPlanId/workouts')
  @AdminMutation()
  async createWorkout(
    @Param() params: TrainingPlanParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() _body: EmptyTrainingPlanRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateTrainingPlanWorkoutResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const result = await this.createWorkoutCommand.execute(
      params.trainingPlanId,
      expectedVersion,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':trainingPlanId/workouts/:workoutId')
  @AdminMutation()
  @HttpCode(204)
  async deleteWorkout(
    @Param() params: TrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const version = await this.deleteWorkoutCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      expectedVersion,
    );
    this.setResourceVersion(response, version);
  }

  @Get(':trainingPlanId/workouts/:workoutId')
  @Header('Cache-Control', 'private, no-store')
  async getWorkout(
    @Param() params: TrainingPlanWorkoutParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingPlanWorkoutDetailsResponse> {
    const result = await this.getWorkoutCommand.execute(
      params.trainingPlanId,
      params.workoutId,
    );
    this.setResourceVersion(response, result.data.version);
    return result;
  }

  @Patch(':trainingPlanId/workouts/:workoutId')
  @EditorMutation()
  async updateWorkout(
    @Param() params: TrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: UpdateTrainingPlanWorkoutDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateTrainingPlanWorkoutResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const result = await this.updateWorkoutCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      expectedVersion,
      input.name,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Post(':trainingPlanId/workouts/:workoutId/exercises')
  @EditorMutation()
  async createExercise(
    @Param() params: TrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: CreateExerciseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateExerciseResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const result = await this.createExerciseCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      expectedVersion,
      input.type,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Put(':trainingPlanId/workouts/:workoutId/exercises/order')
  @EditorMutation()
  @HttpCode(204)
  async reorderExercises(
    @Param() params: TrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: ReorderExercisesDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const version = await this.reorderExercisesCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      expectedVersion,
      input.exerciseIds,
    );
    this.setResourceVersion(response, version);
  }

  @Patch(':trainingPlanId/workouts/:workoutId/exercises/:exerciseId')
  @EditorMutation()
  @Header('Cache-Control', 'private, no-store')
  async updateExercise(
    @Param() params: TrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: UpdateExerciseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateExerciseResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    if (Object.values(input).every((value) => value === undefined))
      throw createValidationException();
    const result = await this.updateExerciseCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      params.exerciseId,
      expectedVersion,
      input,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':trainingPlanId/workouts/:workoutId/exercises/:exerciseId')
  @EditorMutation()
  @HttpCode(204)
  async deleteExercise(
    @Param() params: TrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const version = await this.deleteExerciseCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      params.exerciseId,
      expectedVersion,
    );
    this.setResourceVersion(response, version);
  }

  @Put(':trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image')
  @ImageMutation()
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  async uploadImage(
    @Param() params: TrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @UploadedFile() file: UploadedImageFile,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateExerciseImageResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    if (file === undefined) throw createValidationException();
    const result = await this.uploadImageCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      params.exerciseId,
      expectedVersion,
      file,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image')
  @EditorMutation()
  @HttpCode(204)
  async removeImage(
    @Param() params: TrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const version = await this.removeImageCommand.execute(
      params.trainingPlanId,
      params.workoutId,
      params.exerciseId,
      expectedVersion,
    );
    this.setResourceVersion(response, version);
  }

  private setResourceVersion(response: Response, version: number): void {
    response.setHeader(RESOURCE_VERSION_HEADER, formatResourceVersion(version));
  }
}
