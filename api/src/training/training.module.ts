import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '~/auth/auth.module';
import { TrainingPlanModule } from '~/training-plan/training-plan.module';
import { PutOfflineTrainingSnapshotCommand } from '~/training/commands/put-offline-training-snapshot.command';
import { RegisterOfflineTrainingLeaseCommand } from '~/training/commands/register-offline-training-lease.command';
import { TakeoverOfflineTrainingLeaseCommand } from '~/training/commands/takeover-offline-training-lease.command';
import { TrainingCommand } from '~/training/commands/training.command';
import { OfflineTrainingLeaseController } from '~/training/controllers/offline-training-lease.controller';
import { OfflineTrainingSnapshotController } from '~/training/controllers/offline-training-snapshot.controller';
import { TrainingController } from '~/training/controllers/training.controller';
import { OfflineTrainingSnapshotValidationPipe } from '~/training/dto/offline-training-snapshot.dto';
import { MongoWorkoutExecutionRepository } from '~/training/repositories/mongo-workout-execution.repository';
import { WorkoutExecutionRepository } from '~/training/repositories/workout-execution.repository';
import {
  WorkoutExecutionDocument,
  WorkoutExecutionSchema,
} from '~/training/repositories/workout-execution.schema';
import { OfflineTrainingLeaseService } from '~/training/services/offline-training-lease.service';
import { OfflineTrainingSnapshotContentService } from '~/training/services/offline-training-snapshot-content.service';
import { OfflineTrainingSnapshotLockService } from '~/training/services/offline-training-snapshot-lock.service';
import { OfflineTrainingSnapshotService } from '~/training/services/offline-training-snapshot.service';
import { TrainingClockService } from '~/training/services/training-clock.service';
import { TrainingService } from '~/training/services/training.service';
import { WorkoutSessionStore } from '~/training/stores/workout-session.store';

@Module({
  imports: [
    AuthModule,
    TrainingPlanModule,
    MongooseModule.forFeature([
      { name: WorkoutExecutionDocument.name, schema: WorkoutExecutionSchema },
    ]),
  ],
  controllers: [
    OfflineTrainingLeaseController,
    OfflineTrainingSnapshotController,
    TrainingController,
  ],
  providers: [
    MongoWorkoutExecutionRepository,
    OfflineTrainingLeaseService,
    OfflineTrainingSnapshotContentService,
    OfflineTrainingSnapshotLockService,
    OfflineTrainingSnapshotService,
    OfflineTrainingSnapshotValidationPipe,
    PutOfflineTrainingSnapshotCommand,
    RegisterOfflineTrainingLeaseCommand,
    TakeoverOfflineTrainingLeaseCommand,
    TrainingClockService,
    TrainingCommand,
    TrainingService,
    WorkoutSessionStore,
    {
      provide: WorkoutExecutionRepository,
      useExisting: MongoWorkoutExecutionRepository,
    },
  ],
})
export class TrainingModule {}
