import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '~/auth/auth.module';
import { CreateGlobalTrainingPlanCommand } from '~/training-plan/commands/create-global-training-plan.command';
import { CreateTrainingPlanWorkoutCommand } from '~/training-plan/commands/create-training-plan-workout.command';
import { DeleteGlobalTrainingPlanCommand } from '~/training-plan/commands/delete-global-training-plan.command';
import { DeleteTrainingPlanWorkoutCommand } from '~/training-plan/commands/delete-training-plan-workout.command';
import { GetGlobalTrainingPlanCommand } from '~/training-plan/commands/get-global-training-plan.command';
import { ListGlobalTrainingPlansCommand } from '~/training-plan/commands/list-global-training-plans.command';
import { UpdateGlobalTrainingPlanCommand } from '~/training-plan/commands/update-global-training-plan.command';
import { GlobalTrainingPlansController } from '~/training-plan/controllers/global-training-plans.controller';
import { MongoTrainingPlanRepository } from '~/training-plan/repositories/mongo-training-plan.repository';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import {
  TrainingPlanDocument,
  TrainingPlanSchema,
} from '~/training-plan/repositories/training-plan.schema';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: TrainingPlanDocument.name, schema: TrainingPlanSchema },
    ]),
  ],
  controllers: [GlobalTrainingPlansController],
  providers: [
    CreateGlobalTrainingPlanCommand,
    CreateTrainingPlanWorkoutCommand,
    DeleteGlobalTrainingPlanCommand,
    DeleteTrainingPlanWorkoutCommand,
    GetGlobalTrainingPlanCommand,
    ListGlobalTrainingPlansCommand,
    MongoTrainingPlanRepository,
    TrainingPlanService,
    UpdateGlobalTrainingPlanCommand,
    {
      provide: TrainingPlanRepository,
      useExisting: MongoTrainingPlanRepository,
    },
  ],
})
export class TrainingPlanModule {}
