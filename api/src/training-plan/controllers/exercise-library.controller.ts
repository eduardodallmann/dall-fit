import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type {
  CopyExercisesResponse,
  ExerciseLibraryResponse,
} from '@dall-fit/types';

import { Authenticated } from '~/auth/decorators/authenticated';
import { EditorMutation } from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type { PersonEntity } from '~/person/domain/person.entity';
import { ExerciseLibraryCommand } from '~/training-plan/commands/exercise-library.command';
import {
  formatResourceVersion,
  parseResourceVersion,
  RESOURCE_VERSION_HEADER,
} from '~/training-plan/domain/resource-version';
import {
  CopyExercisesDto,
  ExerciseLibraryQueryDto,
} from '~/training-plan/dto/exercise-library.dto';
import { PersonalTrainingPlanWorkoutParamsDto } from '~/training-plan/dto/training-plan.dto';

@Authenticated()
@Controller('training-plans')
export class ExerciseLibraryController {
  private readonly logger = new Logger(ExerciseLibraryController.name);
  constructor(private readonly command: ExerciseLibraryCommand) {}

  @Get('exercise-library')
  @Header('Cache-Control', 'private, no-store')
  async list(
    @Query() query: ExerciseLibraryQueryDto,
  ): Promise<ExerciseLibraryResponse> {
    this.logger.log('ExerciseLibraryController -> list -> params:', {
      params: { page: query.page },
    });
    const result = await this.command.list(query);
    this.logger.log('ExerciseLibraryController -> list -> command return:', {
      data: { count: result.data.length },
    });
    this.logger.log('ExerciseLibraryController -> list -> return:', {
      data: { count: result.data.length },
    });
    return result;
  }

  @Post(':catalogEntryId/workouts/:workoutId/exercises/copy')
  @EditorMutation()
  @Header('Cache-Control', 'private, no-store')
  async copy(
    @CurrentPerson() person: PersonEntity,
    @Param() params: PersonalTrainingPlanWorkoutParamsDto,
    @Headers(RESOURCE_VERSION_HEADER) version: string | undefined,
    @Body() input: CopyExercisesDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CopyExercisesResponse> {
    const expectedVersion = parseResourceVersion(version);
    this.logger.log('ExerciseLibraryController -> copy -> params:', {
      params: { count: input.selections.length, version: expectedVersion },
    });
    const copied = await this.command.copy(
      person.id,
      params.catalogEntryId,
      params.workoutId,
      expectedVersion,
      input,
    );
    this.logger.log('ExerciseLibraryController -> copy -> command return:', {
      data: { count: copied.response.data.length, version: copied.version },
    });
    response.setHeader(
      RESOURCE_VERSION_HEADER,
      formatResourceVersion(copied.version),
    );
    const result = copied.response;
    this.logger.log('ExerciseLibraryController -> copy -> return:', {
      data: { count: result.data.length },
    });
    return result;
  }
}
