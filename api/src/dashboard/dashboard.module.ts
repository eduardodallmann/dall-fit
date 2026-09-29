import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '~/auth/auth.module';
import { GetAdminDashboardCommand } from '~/dashboard/commands/get-admin-dashboard.command';
import { GetDashboardCommand } from '~/dashboard/commands/get-dashboard.command';
import { DashboardController } from '~/dashboard/controllers/dashboard.controller';
import { DashboardReadRepository } from '~/dashboard/repositories/dashboard-read.repository';
import { MongoDashboardReadRepository } from '~/dashboard/repositories/mongo-dashboard-read.repository';
import { DashboardService } from '~/dashboard/services/dashboard.service';
import {
  PersonDocument,
  PersonSchema,
} from '~/person/repositories/person.schema';
import {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanActiveSchema,
  PersonalTrainingPlanCatalogDocument,
  PersonalTrainingPlanCatalogSchema,
} from '~/training-plan/repositories/personal-training-plan.schema';
import {
  TrainingPlanDocument,
  TrainingPlanSchema,
} from '~/training-plan/repositories/training-plan.schema';
import {
  WorkoutExecutionDocument,
  WorkoutExecutionSchema,
} from '~/training/repositories/workout-execution.schema';
import { TrainingModule } from '~/training/training.module';

@Module({
  imports: [
    AuthModule,
    TrainingModule,
    MongooseModule.forFeature([
      { name: PersonDocument.name, schema: PersonSchema },
      { name: TrainingPlanDocument.name, schema: TrainingPlanSchema },
      { name: WorkoutExecutionDocument.name, schema: WorkoutExecutionSchema },
      {
        name: PersonalTrainingPlanCatalogDocument.name,
        schema: PersonalTrainingPlanCatalogSchema,
      },
      {
        name: PersonalTrainingPlanActiveDocument.name,
        schema: PersonalTrainingPlanActiveSchema,
      },
    ]),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    GetAdminDashboardCommand,
    GetDashboardCommand,
    MongoDashboardReadRepository,
    {
      provide: DashboardReadRepository,
      useExisting: MongoDashboardReadRepository,
    },
  ],
})
export class DashboardModule {}
