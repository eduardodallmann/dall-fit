import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '~/auth/auth.module';
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
import { GlobalTrainingPlansController } from '~/training-plan/controllers/global-training-plans.controller';
import { MongoTrainingPlanRepository } from '~/training-plan/repositories/mongo-training-plan.repository';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import {
  TrainingPlanDocument,
  TrainingPlanSchema,
} from '~/training-plan/repositories/training-plan.schema';
import { BlobStorageService } from '~/training-plan/services/blob-storage.service';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';
import { YoutubeReferenceService } from '~/training-plan/services/youtube-reference.service';

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
    CreateTrainingPlanExerciseCommand,
    CreateTrainingPlanWorkoutCommand,
    DeleteGlobalTrainingPlanCommand,
    DeleteTrainingPlanExerciseCommand,
    DeleteTrainingPlanWorkoutCommand,
    GetGlobalTrainingPlanCommand,
    GetTrainingPlanWorkoutCommand,
    ListGlobalTrainingPlansCommand,
    RemoveTrainingPlanExerciseImageCommand,
    ReorderTrainingPlanExercisesCommand,
    MongoTrainingPlanRepository,
    TrainingPlanService,
    BlobStorageService,
    ExerciseImageService,
    YoutubeReferenceService,
    UpdateGlobalTrainingPlanCommand,
    UpdateTrainingPlanExerciseCommand,
    UpdateTrainingPlanWorkoutCommand,
    UploadTrainingPlanExerciseImageCommand,
    {
      provide: TrainingPlanRepository,
      useExisting: MongoTrainingPlanRepository,
    },
  ],
})
export class TrainingPlanModule {}
