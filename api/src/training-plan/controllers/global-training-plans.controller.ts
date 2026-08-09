import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import type {
  CreateTrainingPlanResponse,
  CreateTrainingPlanWorkoutResponse,
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetailsResponse,
  UpdateTrainingPlanResponse,
} from '@dall-fit/types';

import { AdminOnly } from '~/auth/decorators/admin-only';
import { AdminMutation } from '~/auth/decorators/authenticated-mutation';
import { CreateGlobalTrainingPlanCommand } from '~/training-plan/commands/create-global-training-plan.command';
import { CreateTrainingPlanWorkoutCommand } from '~/training-plan/commands/create-training-plan-workout.command';
import { DeleteGlobalTrainingPlanCommand } from '~/training-plan/commands/delete-global-training-plan.command';
import { DeleteTrainingPlanWorkoutCommand } from '~/training-plan/commands/delete-training-plan-workout.command';
import { GetGlobalTrainingPlanCommand } from '~/training-plan/commands/get-global-training-plan.command';
import { ListGlobalTrainingPlansCommand } from '~/training-plan/commands/list-global-training-plans.command';
import { UpdateGlobalTrainingPlanCommand } from '~/training-plan/commands/update-global-training-plan.command';
import {
  CreateTrainingPlanDto,
  EmptyTrainingPlanRequestDto,
  ListTrainingPlansQueryDto,
  TrainingPlanParamsDto,
  TrainingPlanWorkoutParamsDto,
  UpdateTrainingPlanDto,
} from '~/training-plan/dto/training-plan.dto';

@AdminOnly()
@Controller('global/training-plans')
export class GlobalTrainingPlansController {
  private readonly logger = new Logger(GlobalTrainingPlansController.name);

  constructor(
    private readonly listGlobalTrainingPlansCommand: ListGlobalTrainingPlansCommand,
    private readonly createGlobalTrainingPlanCommand: CreateGlobalTrainingPlanCommand,
    private readonly getGlobalTrainingPlanCommand: GetGlobalTrainingPlanCommand,
    private readonly updateGlobalTrainingPlanCommand: UpdateGlobalTrainingPlanCommand,
    private readonly deleteGlobalTrainingPlanCommand: DeleteGlobalTrainingPlanCommand,
    private readonly createTrainingPlanWorkoutCommand: CreateTrainingPlanWorkoutCommand,
    private readonly deleteTrainingPlanWorkoutCommand: DeleteTrainingPlanWorkoutCommand,
  ) {}

  @Get()
  async list(
    @Query() query: ListTrainingPlansQueryDto,
  ): Promise<GlobalTrainingPlanCollectionResponse> {
    this.logger.log('GlobalTrainingPlansController -> list -> params:', {
      params: { page: query.page },
    });

    const commandResult = await this.listGlobalTrainingPlansCommand.execute(
      query.page,
    );
    this.logger.log(
      'GlobalTrainingPlansController -> list -> listGlobalTrainingPlansCommand return:',
      {
        data: { count: commandResult.data.length, total: commandResult.total },
      },
    );

    const result = commandResult;
    this.logger.log('GlobalTrainingPlansController -> list -> return:', {
      data: {
        count: result.data.length,
        page: result.page,
        total: result.total,
      },
    });

    return result;
  }

  @Post()
  @AdminMutation()
  async create(
    @Body() input: CreateTrainingPlanDto,
  ): Promise<CreateTrainingPlanResponse> {
    this.logger.log('GlobalTrainingPlansController -> create -> params:', {
      params: { fields: Object.keys(input) },
    });

    const commandResult =
      await this.createGlobalTrainingPlanCommand.execute(input);
    this.logger.log(
      'GlobalTrainingPlansController -> create -> createGlobalTrainingPlanCommand return:',
      { data: { trainingPlanId: commandResult.data.id } },
    );

    const result = commandResult;
    this.logger.log('GlobalTrainingPlansController -> create -> return:', {
      data: { trainingPlanId: result.data.id },
    });

    return result;
  }

  @Get(':trainingPlanId')
  async get(
    @Param() params: TrainingPlanParamsDto,
  ): Promise<TrainingPlanDetailsResponse> {
    this.logger.log('GlobalTrainingPlansController -> get -> params:', {
      params: { trainingPlanId: params.trainingPlanId },
    });

    const commandResult = await this.getGlobalTrainingPlanCommand.execute(
      params.trainingPlanId,
    );
    this.logger.log(
      'GlobalTrainingPlansController -> get -> getGlobalTrainingPlanCommand return:',
      {
        data: {
          trainingPlanId: commandResult.data.id,
          workoutCount: commandResult.data.workouts.length,
        },
      },
    );

    const result = commandResult;
    this.logger.log('GlobalTrainingPlansController -> get -> return:', {
      data: {
        trainingPlanId: result.data.id,
        workoutCount: result.data.workouts.length,
      },
    });

    return result;
  }

  @Patch(':trainingPlanId')
  @AdminMutation()
  async update(
    @Param() params: TrainingPlanParamsDto,
    @Body() changes: UpdateTrainingPlanDto,
  ): Promise<UpdateTrainingPlanResponse> {
    this.logger.log('GlobalTrainingPlansController -> update -> params:', {
      params: {
        fields: Object.keys(changes),
        trainingPlanId: params.trainingPlanId,
      },
    });

    const commandResult = await this.updateGlobalTrainingPlanCommand.execute(
      params.trainingPlanId,
      changes,
    );
    this.logger.log(
      'GlobalTrainingPlansController -> update -> updateGlobalTrainingPlanCommand return:',
      { data: { trainingPlanId: commandResult.data.id } },
    );

    const result = commandResult;
    this.logger.log('GlobalTrainingPlansController -> update -> return:', {
      data: { trainingPlanId: result.data.id },
    });

    return result;
  }

  @Delete(':trainingPlanId')
  @AdminMutation()
  @HttpCode(204)
  async delete(@Param() params: TrainingPlanParamsDto): Promise<void> {
    this.logger.log('GlobalTrainingPlansController -> delete -> params:', {
      params: { trainingPlanId: params.trainingPlanId },
    });

    await this.deleteGlobalTrainingPlanCommand.execute(params.trainingPlanId);
    this.logger.log(
      'GlobalTrainingPlansController -> delete -> deleteGlobalTrainingPlanCommand completed:',
      { data: { trainingPlanId: params.trainingPlanId } },
    );
    this.logger.log('GlobalTrainingPlansController -> delete -> completed:', {
      data: { trainingPlanId: params.trainingPlanId },
    });
  }

  @Post(':trainingPlanId/workouts')
  @AdminMutation()
  async createWorkout(
    @Param() params: TrainingPlanParamsDto,
    @Body() body: EmptyTrainingPlanRequestDto,
  ): Promise<CreateTrainingPlanWorkoutResponse> {
    this.logger.log(
      'GlobalTrainingPlansController -> createWorkout -> params:',
      {
        params: {
          bodyFields: Object.keys(body),
          trainingPlanId: params.trainingPlanId,
        },
      },
    );

    const commandResult = await this.createTrainingPlanWorkoutCommand.execute(
      params.trainingPlanId,
    );
    this.logger.log(
      'GlobalTrainingPlansController -> createWorkout -> createTrainingPlanWorkoutCommand return:',
      {
        data: {
          trainingPlanId: params.trainingPlanId,
          workoutId: commandResult.data.id,
        },
      },
    );

    const result = commandResult;
    this.logger.log(
      'GlobalTrainingPlansController -> createWorkout -> return:',
      {
        data: {
          trainingPlanId: params.trainingPlanId,
          workoutId: result.data.id,
        },
      },
    );

    return result;
  }

  @Delete(':trainingPlanId/workouts/:workoutId')
  @AdminMutation()
  @HttpCode(204)
  async deleteWorkout(
    @Param() params: TrainingPlanWorkoutParamsDto,
  ): Promise<void> {
    this.logger.log(
      'GlobalTrainingPlansController -> deleteWorkout -> params:',
      {
        params: {
          trainingPlanId: params.trainingPlanId,
          workoutId: params.workoutId,
        },
      },
    );

    await this.deleteTrainingPlanWorkoutCommand.execute(
      params.trainingPlanId,
      params.workoutId,
    );
    this.logger.log(
      'GlobalTrainingPlansController -> deleteWorkout -> deleteTrainingPlanWorkoutCommand completed:',
      {
        data: {
          trainingPlanId: params.trainingPlanId,
          workoutId: params.workoutId,
        },
      },
    );
    this.logger.log(
      'GlobalTrainingPlansController -> deleteWorkout -> completed:',
      {
        data: {
          trainingPlanId: params.trainingPlanId,
          workoutId: params.workoutId,
        },
      },
    );
  }
}
