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
  ActivatePersonalTrainingPlanResponse,
  CreateExerciseResponse,
  CreateGlobalTrainingPlanReferenceResponse,
  CreatePersonalTrainingPlanResponse,
  CreateTrainingPlanWorkoutResponse,
  GlobalTrainingPlanLibraryResponse,
  PersonalTrainingPlanCollectionResponse,
  PersonalTrainingPlanDetailsResponse,
  TrainingPlanCloneJobResponse,
  TrainingPlanWorkoutDetailsResponse,
  UpdateExerciseImageResponse,
  UpdateExerciseResponse,
  UpdateTrainingPlanResponse,
  UpdateTrainingPlanWorkoutResponse,
} from '@dall-fit/types';

import { Authenticated } from '~/auth/decorators/authenticated';
import {
  AuthenticatedMutation,
  EditorMutation,
  ImageMutation,
} from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type { PersonEntity } from '~/person/domain/person.entity';
import { PersonalTrainingPlansCommand } from '~/training-plan/commands/personal-training-plans.command';
import {
  formatResourceVersion,
  parseResourceVersion,
  RESOURCE_VERSION_HEADER,
} from '~/training-plan/domain/resource-version';
import type { UploadedImageFile } from '~/training-plan/domain/training-plan.entity';
import {
  ActivatePersonalTrainingPlanDto,
  CreateExerciseDto,
  CreateGlobalTrainingPlanReferenceDto,
  CreateTrainingPlanDto,
  EmptyTrainingPlanRequestDto,
  ListTrainingPlansQueryDto,
  PersonalTrainingPlanExerciseParamsDto,
  PersonalTrainingPlanParamsDto,
  PersonalTrainingPlanWorkoutParamsDto,
  ReorderExercisesDto,
  TrainingPlanCloneJobParamsDto,
  UpdateExerciseDto,
  UpdateTrainingPlanDto,
  UpdateTrainingPlanWorkoutDto,
} from '~/training-plan/dto/training-plan.dto';
import { createValidationException } from '~/training-plan/errors/training-plan.errors';

@Authenticated()
@Controller('training-plans')
export class PersonalTrainingPlansController {
  private readonly logger = new Logger(PersonalTrainingPlansController.name);

  constructor(private readonly command: PersonalTrainingPlansCommand) {}

  @Get()
  async list(
    @CurrentPerson() person: PersonEntity,
    @Query() query: ListTrainingPlansQueryDto,
  ): Promise<PersonalTrainingPlanCollectionResponse> {
    this.logParams('list', { page: query.page, personId: person.id });
    const result = await this.command.list(person.id, query.page);
    this.logReturn('list', { count: result.data.length, personId: person.id });
    return result;
  }

  @Get('library')
  async library(
    @CurrentPerson() person: PersonEntity,
    @Query() query: ListTrainingPlansQueryDto,
  ): Promise<GlobalTrainingPlanLibraryResponse> {
    this.logParams('library', { page: query.page, personId: person.id });
    const result = await this.command.library(person.id, query.page);
    this.logReturn('library', {
      count: result.data.length,
      personId: person.id,
    });
    return result;
  }

  @Post()
  @AuthenticatedMutation()
  async create(
    @CurrentPerson() person: PersonEntity,
    @Body() input: CreateTrainingPlanDto,
  ): Promise<CreatePersonalTrainingPlanResponse> {
    this.logParams('create', {
      fields: Object.keys(input),
      personId: person.id,
    });
    const result = await this.command.create(person.id, input);
    return result;
  }

  @Post('global-references')
  @AuthenticatedMutation()
  async createReference(
    @CurrentPerson() person: PersonEntity,
    @Body() input: CreateGlobalTrainingPlanReferenceDto,
  ): Promise<CreateGlobalTrainingPlanReferenceResponse> {
    this.logParams('createReference', {
      globalTrainingPlanId: input.globalTrainingPlanId,
      personId: person.id,
    });
    const result = await this.command.createReference(
      person.id,
      input.globalTrainingPlanId,
    );
    return result;
  }

  @Put('active')
  @AuthenticatedMutation()
  async activate(
    @CurrentPerson() person: PersonEntity,
    @Body() input: ActivatePersonalTrainingPlanDto,
  ): Promise<ActivatePersonalTrainingPlanResponse> {
    this.logParams('activate', {
      active: input.active,
      catalogEntryId: input.catalogEntryId,
      personId: person.id,
    });
    const result = await this.command.activate(
      person.id,
      input.catalogEntryId,
      input.active,
    );
    return result;
  }

  @Get(':catalogEntryId')
  async get(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PersonalTrainingPlanDetailsResponse> {
    this.logParams('get', {
      catalogEntryId: params.catalogEntryId,
      personId: person.id,
    });
    const result = await this.command.get(person.id, params.catalogEntryId);
    this.setResourceVersion(response, result.data.version);
    return result;
  }

  @Patch(':catalogEntryId')
  @AuthenticatedMutation()
  async update(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() changes: UpdateTrainingPlanDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateTrainingPlanResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    const result = await this.command.update(
      person.id,
      params.catalogEntryId,
      expectedVersion,
      changes,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':catalogEntryId')
  @AuthenticatedMutation()
  @HttpCode(204)
  async delete(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
  ): Promise<void> {
    const expectedVersion =
      resourceVersion === undefined
        ? undefined
        : parseResourceVersion(resourceVersion);
    await this.command.delete(
      person.id,
      params.catalogEntryId,
      expectedVersion,
    );
  }

  @Post(':catalogEntryId/workouts')
  @EditorMutation()
  async createWorkout(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() _body: EmptyTrainingPlanRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateTrainingPlanWorkoutResponse> {
    const result = await this.command.createWorkout(
      person.id,
      params.catalogEntryId,
      parseResourceVersion(resourceVersion),
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Post(':catalogEntryId/workouts/:workoutId/duplicate')
  @EditorMutation()
  async duplicateWorkout(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() _body: EmptyTrainingPlanRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateTrainingPlanWorkoutResponse> {
    const expectedVersion = parseResourceVersion(resourceVersion);
    this.logParams('duplicateWorkout', {
      personId: person.id,
      ...params,
      expectedVersion,
    });
    const commandResult = await this.command.duplicateWorkout(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      expectedVersion,
    );
    this.logger.log(
      'PersonalTrainingPlansController -> duplicateWorkout -> command return:',
      {
        data: {
          workoutId: commandResult.response.data.id,
          version: commandResult.version,
        },
      },
    );
    this.setResourceVersion(response, commandResult.version);
    const result = commandResult.response;
    this.logReturn('duplicateWorkout', {
      workoutId: result.data.id,
      version: commandResult.version,
    });
    return result;
  }

  @Get(':catalogEntryId/workouts/:workoutId')
  @Header('Cache-Control', 'private, no-store')
  async getWorkout(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanWorkoutParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingPlanWorkoutDetailsResponse> {
    const result = await this.command.getWorkout(
      person.id,
      params.catalogEntryId,
      params.workoutId,
    );
    this.setResourceVersion(response, result.data.version);
    return result;
  }

  @Patch(':catalogEntryId/workouts/:workoutId')
  @EditorMutation()
  async updateWorkout(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: UpdateTrainingPlanWorkoutDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateTrainingPlanWorkoutResponse> {
    const result = await this.command.updateWorkout(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      parseResourceVersion(resourceVersion),
      input.name,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':catalogEntryId/workouts/:workoutId')
  @EditorMutation()
  @HttpCode(204)
  async deleteWorkout(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const version = await this.command.deleteWorkout(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      parseResourceVersion(resourceVersion),
    );
    this.setResourceVersion(response, version);
  }

  @Post(':catalogEntryId/workouts/:workoutId/exercises')
  @EditorMutation()
  async createExercise(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: CreateExerciseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateExerciseResponse> {
    const result = await this.command.createExercise(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      parseResourceVersion(resourceVersion),
      input.type,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Put(':catalogEntryId/workouts/:workoutId/exercises/order')
  @EditorMutation()
  @HttpCode(204)
  async reorderExercises(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: ReorderExercisesDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const version = await this.command.reorderExercises(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      parseResourceVersion(resourceVersion),
      input,
    );
    this.setResourceVersion(response, version);
  }

  @Patch(':catalogEntryId/workouts/:workoutId/exercises/:exerciseId')
  @EditorMutation()
  @Header('Cache-Control', 'private, no-store')
  async updateExercise(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: UpdateExerciseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateExerciseResponse> {
    if (Object.values(input).every((value) => value === undefined))
      throw createValidationException();
    const result = await this.command.updateExercise(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      params.exerciseId,
      parseResourceVersion(resourceVersion),
      input,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':catalogEntryId/workouts/:workoutId/exercises/:exerciseId')
  @EditorMutation()
  @HttpCode(204)
  async deleteExercise(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const version = await this.command.deleteExercise(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      params.exerciseId,
      parseResourceVersion(resourceVersion),
    );
    this.setResourceVersion(response, version);
  }

  @Put(':catalogEntryId/workouts/:workoutId/exercises/:exerciseId/image')
  @ImageMutation()
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  async uploadImage(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @UploadedFile() file: UploadedImageFile,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UpdateExerciseImageResponse> {
    if (file === undefined) throw createValidationException();
    const result = await this.command.uploadImage(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      params.exerciseId,
      parseResourceVersion(resourceVersion),
      file,
    );
    this.setResourceVersion(response, result.version);
    return result.response;
  }

  @Delete(':catalogEntryId/workouts/:workoutId/exercises/:exerciseId/image')
  @EditorMutation()
  @HttpCode(204)
  async removeImage(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const version = await this.command.removeImage(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      params.exerciseId,
      parseResourceVersion(resourceVersion),
    );
    this.setResourceVersion(response, version);
  }

  private setResourceVersion(response: Response, version: number): void {
    response.setHeader(RESOURCE_VERSION_HEADER, formatResourceVersion(version));
  }

  private logParams(method: string, params: Record<string, unknown>): void {
    this.logger.log(`PersonalTrainingPlansController -> ${method} -> params:`, {
      params,
    });
  }

  private logReturn(method: string, data: Record<string, unknown>): void {
    this.logger.log(`PersonalTrainingPlansController -> ${method} -> return:`, {
      data,
    });
  }
}

@Authenticated()
@Controller('training-plan-clone-jobs')
export class TrainingPlanCloneJobsController {
  private readonly logger = new Logger(TrainingPlanCloneJobsController.name);

  constructor(private readonly command: PersonalTrainingPlansCommand) {}

  @Post()
  @AuthenticatedMutation()
  @HttpCode(202)
  async start(
    @CurrentPerson() person: PersonEntity,
    @Body() input: CreateGlobalTrainingPlanReferenceDto,
  ): Promise<TrainingPlanCloneJobResponse> {
    this.logger.log('TrainingPlanCloneJobsController -> start -> params:', {
      params: {
        globalTrainingPlanId: input.globalTrainingPlanId,
        personId: person.id,
      },
    });
    const result = await this.command.startClone(
      person.id,
      input.globalTrainingPlanId,
    );
    return result;
  }

  @Post(':cloneJobId/retry')
  @AuthenticatedMutation()
  @HttpCode(202)
  async retry(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingPlanCloneJobParamsDto,
    @Body() _body: EmptyTrainingPlanRequestDto,
  ): Promise<TrainingPlanCloneJobResponse> {
    const result = await this.command.retryClone(person.id, params.cloneJobId);
    return result;
  }

  @Delete(':cloneJobId')
  @AuthenticatedMutation()
  @HttpCode(202)
  async cancel(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingPlanCloneJobParamsDto,
  ): Promise<TrainingPlanCloneJobResponse> {
    const result = await this.command.cancelClone(person.id, params.cloneJobId);
    return result;
  }
}
