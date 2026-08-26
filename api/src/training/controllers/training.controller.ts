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
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type {
  TrainingOverviewResponse,
  TrainingSessionResponse,
  TrainingWorkoutPreviewResponse,
  WorkoutExecutionSummaryResponse,
} from '@dall-fit/types';

import { Authenticated } from '~/auth/decorators/authenticated';
import {
  TrainingLifecycleMutation,
  TrainingMutation,
} from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type { PersonEntity } from '~/person/domain/person.entity';
import {
  formatResourceVersion,
  parseResourceVersion,
  RESOURCE_VERSION_HEADER,
} from '~/training-plan/domain/resource-version';
import { TrainingCommand } from '~/training/commands/training.command';
import {
  CompleteRemainingTrainingSeriesDto,
  CompleteTrainingSessionDto,
  EmptyTrainingDto,
  ResolveTrainingTimerDto,
  StartTrainingTimerDto,
  TrainingExerciseParamsDto,
  TrainingLoadDto,
  TrainingSeriesParamsDto,
  TrainingWorkoutParamsDto,
  WorkoutExecutionParamsDto,
} from '~/training/dto/training.dto';

@Authenticated()
@Controller('training')
export class TrainingController {
  private readonly logger = new Logger(TrainingController.name);

  constructor(private readonly command: TrainingCommand) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async overview(
    @CurrentPerson() person: PersonEntity,
  ): Promise<TrainingOverviewResponse> {
    this.logParams('overview', { personId: person.id });
    const result = await this.command.overview(person.id);
    this.logReturn('overview', { workoutCount: result.data.workouts.length });
    return result;
  }

  @Get('workouts/:workoutId')
  @Header('Cache-Control', 'private, no-store')
  async preview(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingWorkoutParamsDto,
  ): Promise<TrainingWorkoutPreviewResponse> {
    this.logParams('preview', {
      personId: person.id,
      workoutId: params.workoutId,
    });
    const result = await this.command.preview(person.id, params.workoutId);
    this.logReturn('preview', { exerciseCount: result.data.exercises.length });
    return result;
  }

  @Post('workouts/:workoutId/session')
  @TrainingLifecycleMutation()
  @Header('Cache-Control', 'private, no-store')
  async start(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingWorkoutParamsDto,
    @Body() _body: EmptyTrainingDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('start', {
      personId: person.id,
      workoutId: params.workoutId,
    });
    const result = await this.command.start(person.id, params.workoutId);
    this.setVersion(response, result.data.version);
    this.logReturn('start', { version: result.data.version });
    return result;
  }

  @Get('session')
  @Header('Cache-Control', 'private, no-store')
  async session(
    @CurrentPerson() person: PersonEntity,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('session', { personId: person.id });
    const result = await this.command.session(person.id);
    this.setVersion(response, result.data.version);
    this.logReturn('session', { version: result.data.version });
    return result;
  }

  @Delete('session')
  @TrainingLifecycleMutation()
  @HttpCode(204)
  async abandon(@CurrentPerson() person: PersonEntity): Promise<void> {
    this.logParams('abandon', { personId: person.id });
    await this.command.abandon(person.id);
    this.logReturn('abandon', { personId: person.id });
  }

  @Put('session/exercises/:exerciseId/series/:seriesNumber/load')
  @TrainingMutation()
  @Header('Cache-Control', 'private, no-store')
  async load(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingSeriesParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() body: TrainingLoadDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('load', {
      exerciseId: params.exerciseId,
      personId: person.id,
      seriesNumber: params.seriesNumber,
      versionPresent: version !== undefined,
    });
    const result = await this.command.load(
      person.id,
      params.exerciseId,
      params.seriesNumber,
      body.loadKg,
      parseResourceVersion(version),
    );
    this.setVersion(response, result.data.version);
    this.logReturn('load', { version: result.data.version });
    return result;
  }

  @Post('session/exercises/:exerciseId/series/:seriesNumber/complete')
  @TrainingMutation()
  @Header('Cache-Control', 'private, no-store')
  async completeSeries(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingSeriesParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() body: TrainingLoadDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('completeSeries', {
      exerciseId: params.exerciseId,
      personId: person.id,
      seriesNumber: params.seriesNumber,
      versionPresent: version !== undefined,
    });
    const result = await this.command.completeSeries(
      person.id,
      params.exerciseId,
      params.seriesNumber,
      body.loadKg,
      parseResourceVersion(version),
    );
    this.setVersion(response, result.data.version);
    this.logReturn('completeSeries', { version: result.data.version });
    return result;
  }

  @Post('session/exercises/:exerciseId/series/complete-remaining')
  @TrainingMutation()
  @Header('Cache-Control', 'private, no-store')
  async completeRemaining(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() body: CompleteRemainingTrainingSeriesDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('completeRemaining', {
      exerciseId: params.exerciseId,
      personId: person.id,
      seriesCount: body.loadsKg.length,
      versionPresent: version !== undefined,
    });
    const result = await this.command.completeRemaining(
      person.id,
      params.exerciseId,
      body.loadsKg,
      parseResourceVersion(version),
    );
    this.setVersion(response, result.data.version);
    this.logReturn('completeRemaining', { version: result.data.version });
    return result;
  }

  @Post('session/exercises/:exerciseId/timer')
  @TrainingMutation()
  @Header('Cache-Control', 'private, no-store')
  async startTimer(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() body: StartTrainingTimerDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('startTimer', {
      exerciseId: params.exerciseId,
      kind: body.kind,
      personId: person.id,
      versionPresent: version !== undefined,
    });
    const result = await this.command.startTimer(
      person.id,
      params.exerciseId,
      body.kind,
      parseResourceVersion(version),
    );
    this.setVersion(response, result.data.version);
    this.logReturn('startTimer', { version: result.data.version });
    return result;
  }

  @Post('session/timer/resolve')
  @TrainingMutation()
  @Header('Cache-Control', 'private, no-store')
  async resolveTimer(
    @CurrentPerson() person: PersonEntity,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() body: ResolveTrainingTimerDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('resolveTimer', {
      outcome: body.outcome,
      personId: person.id,
      versionPresent: version !== undefined,
    });
    const result = await this.command.resolveTimer(
      person.id,
      body.outcome,
      parseResourceVersion(version),
    );
    this.setVersion(response, result.data.version);
    this.logReturn('resolveTimer', { version: result.data.version });
    return result;
  }

  @Post('session/exercises/:exerciseId/complete')
  @TrainingMutation()
  @Header('Cache-Control', 'private, no-store')
  async completeExercise(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() _body: EmptyTrainingDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('completeExercise', {
      exerciseId: params.exerciseId,
      personId: person.id,
      versionPresent: version !== undefined,
    });
    const result = await this.command.completeExercise(
      person.id,
      params.exerciseId,
      parseResourceVersion(version),
    );
    this.setVersion(response, result.data.version);
    this.logReturn('completeExercise', { version: result.data.version });
    return result;
  }

  @Post('session/exercises/:exerciseId/restart')
  @TrainingMutation()
  @Header('Cache-Control', 'private, no-store')
  async restartExercise(
    @CurrentPerson() person: PersonEntity,
    @Param() params: TrainingExerciseParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() _body: EmptyTrainingDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingSessionResponse> {
    this.logParams('restartExercise', {
      exerciseId: params.exerciseId,
      personId: person.id,
      versionPresent: version !== undefined,
    });
    const result = await this.command.restartExercise(
      person.id,
      params.exerciseId,
      parseResourceVersion(version),
    );
    this.setVersion(response, result.data.version);
    this.logReturn('restartExercise', { version: result.data.version });
    return result;
  }

  @Post('session/complete')
  @TrainingLifecycleMutation()
  async complete(
    @CurrentPerson() person: PersonEntity,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() body: CompleteTrainingSessionDto,
  ): Promise<WorkoutExecutionSummaryResponse> {
    this.logParams('complete', {
      confirmIncomplete: body.confirmIncomplete,
      personId: person.id,
      versionPresent: version !== undefined,
    });
    const result = await this.command.complete(
      person.id,
      parseResourceVersion(version),
      body.confirmIncomplete,
      body.timezone,
    );
    this.logReturn('complete', { executionId: result.data.id });
    return result;
  }

  @Get('completions/:workoutExecutionId')
  async completion(
    @CurrentPerson() person: PersonEntity,
    @Param() params: WorkoutExecutionParamsDto,
  ): Promise<WorkoutExecutionSummaryResponse> {
    this.logParams('completion', {
      executionId: params.workoutExecutionId,
      personId: person.id,
    });
    const result = await this.command.completion(
      person.id,
      params.workoutExecutionId,
    );
    this.logReturn('completion', { executionId: result.data.id });
    return result;
  }

  private setVersion(response: Response, version: number): void {
    response.setHeader(RESOURCE_VERSION_HEADER, formatResourceVersion(version));
  }

  private logParams(method: string, params: Record<string, unknown>): void {
    this.logger.log(`TrainingController -> ${method} -> params:`, { params });
  }

  private logReturn(method: string, data: Record<string, unknown>): void {
    this.logger.log(`TrainingController -> ${method} -> return:`, { data });
  }
}
