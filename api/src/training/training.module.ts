import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AppCompatibilityModule } from '~/app-compatibility/app-compatibility.module';
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
import { MongoOfflineTrainingTerminalReceiptRepository } from '~/training/repositories/mongo-offline-training-terminal-receipt.repository';
import { MongoWorkoutExecutionRepository } from '~/training/repositories/mongo-workout-execution.repository';
import { OfflineTrainingTerminalReceiptRepository } from '~/training/repositories/offline-training-terminal-receipt.repository';
import {
  OfflineTrainingTerminalReceiptDocument,
  OfflineTrainingTerminalReceiptSchema,
} from '~/training/repositories/offline-training-terminal-receipt.schema';
import { WorkoutExecutionRepository } from '~/training/repositories/workout-execution.repository';
import {
  WorkoutExecutionDocument,
  WorkoutExecutionSchema,
} from '~/training/repositories/workout-execution.schema';
import { OfflineTrainingLeaseService } from '~/training/services/offline-training-lease.service';
import { OfflineTrainingSnapshotContentService } from '~/training/services/offline-training-snapshot-content.service';
import { OfflineTrainingSnapshotLockService } from '~/training/services/offline-training-snapshot-lock.service';
import { OfflineTrainingSnapshotService } from '~/training/services/offline-training-snapshot.service';
import { OfflineTrainingTerminalService } from '~/training/services/offline-training-terminal.service';
import { TrainingClockService } from '~/training/services/training-clock.service';
import { TrainingService } from '~/training/services/training.service';
import { WorkoutSessionStore } from '~/training/stores/workout-session.store';

@Module({
  imports: [
    AppCompatibilityModule,
    AuthModule,
    TrainingPlanModule,
    MongooseModule.forFeature([
      {
        name: OfflineTrainingTerminalReceiptDocument.name,
        schema: OfflineTrainingTerminalReceiptSchema,
      },
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
    MongoOfflineTrainingTerminalReceiptRepository,
    OfflineTrainingLeaseService,
    OfflineTrainingSnapshotContentService,
    OfflineTrainingSnapshotLockService,
    OfflineTrainingSnapshotService,
    OfflineTrainingTerminalService,
    OfflineTrainingSnapshotValidationPipe,
    PutOfflineTrainingSnapshotCommand,
    RegisterOfflineTrainingLeaseCommand,
    TakeoverOfflineTrainingLeaseCommand,
    TrainingClockService,
    TrainingCommand,
    TrainingService,
    WorkoutSessionStore,
    {
      provide: OfflineTrainingTerminalReceiptRepository,
      useExisting: MongoOfflineTrainingTerminalReceiptRepository,
    },
    {
      provide: WorkoutExecutionRepository,
      useExisting: MongoWorkoutExecutionRepository,
    },
  ],
})
export class TrainingModule {}
