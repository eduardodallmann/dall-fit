import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '~/auth/auth.module';
import {
  ConfirmTrainingPlanAssistantSessionCommand,
  CreateTrainingPlanAssistantSessionCommand,
  DeleteTrainingPlanAssistantSessionCommand,
  GenerateTrainingPlanAssistantDraftCommand,
  GetTrainingPlanAssistantSessionCommand,
  SendTrainingPlanAssistantMessageCommand,
} from '~/training-plan-assistant/commands/training-plan-assistant.commands';
import { TrainingPlanAssistantController } from '~/training-plan-assistant/controllers/training-plan-assistant.controller';
import { FakeTrainingPlanAssistantProvider } from '~/training-plan-assistant/providers/fake-training-plan-assistant.provider';
import { GroqTrainingPlanAssistantProvider } from '~/training-plan-assistant/providers/groq-training-plan-assistant.provider';
import { MongoTrainingPlanAssistantRepository } from '~/training-plan-assistant/repositories/mongo-training-plan-assistant.repository';
import { TrainingPlanAssistantRepository } from '~/training-plan-assistant/repositories/training-plan-assistant.repository';
import {
  TrainingPlanAssistantReceiptDocument,
  TrainingPlanAssistantReceiptSchema,
  TrainingPlanAssistantSessionDocument,
  TrainingPlanAssistantSessionSchema,
} from '~/training-plan-assistant/repositories/training-plan-assistant.schema';
import { AssistantCatalogService } from '~/training-plan-assistant/services/assistant-catalog.service';
import { AssistantProviderService } from '~/training-plan-assistant/services/assistant-provider.service';
import { TrainingPlanAssistantSessionService } from '~/training-plan-assistant/services/training-plan-assistant-session.service';
import { TrainingPlanModule } from '~/training-plan/training-plan.module';

@Module({
  imports: [
    AuthModule,
    TrainingPlanModule,
    MongooseModule.forFeature([
      {
        name: TrainingPlanAssistantSessionDocument.name,
        schema: TrainingPlanAssistantSessionSchema,
      },
      {
        name: TrainingPlanAssistantReceiptDocument.name,
        schema: TrainingPlanAssistantReceiptSchema,
      },
    ]),
  ],
  controllers: [TrainingPlanAssistantController],
  providers: [
    AssistantCatalogService,
    AssistantProviderService,
    ConfirmTrainingPlanAssistantSessionCommand,
    CreateTrainingPlanAssistantSessionCommand,
    DeleteTrainingPlanAssistantSessionCommand,
    FakeTrainingPlanAssistantProvider,
    GenerateTrainingPlanAssistantDraftCommand,
    GetTrainingPlanAssistantSessionCommand,
    GroqTrainingPlanAssistantProvider,
    MongoTrainingPlanAssistantRepository,
    SendTrainingPlanAssistantMessageCommand,
    TrainingPlanAssistantSessionService,
    {
      provide: TrainingPlanAssistantRepository,
      useExisting: MongoTrainingPlanAssistantRepository,
    },
  ],
})
export class TrainingPlanAssistantModule {}
