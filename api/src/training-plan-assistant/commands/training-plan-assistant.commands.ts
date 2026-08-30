import { Injectable, Logger } from '@nestjs/common';

import type {
  TrainingPlanAssistantConfirmationResponse,
  TrainingPlanAssistantSessionResponse,
} from '@dall-fit/types';

import { TrainingPlanAssistantSessionService } from '~/training-plan-assistant/services/training-plan-assistant-session.service';

@Injectable()
export class GetTrainingPlanAssistantSessionCommand {
  private readonly logger = new Logger(
    GetTrainingPlanAssistantSessionCommand.name,
  );
  constructor(private readonly sessions: TrainingPlanAssistantSessionService) {}

  async execute(
    personId: string,
  ): Promise<TrainingPlanAssistantSessionResponse | null> {
    this.logger.log(
      'GetTrainingPlanAssistantSessionCommand -> execute -> params:',
      { params: { personId } },
    );
    const session = await this.sessions.get(personId);
    const result = session === null ? null : { data: session };
    this.logger.log(
      'GetTrainingPlanAssistantSessionCommand -> execute -> return:',
      { data: { found: result !== null, personId } },
    );
    return result;
  }
}

@Injectable()
export class CreateTrainingPlanAssistantSessionCommand {
  private readonly logger = new Logger(
    CreateTrainingPlanAssistantSessionCommand.name,
  );
  constructor(private readonly sessions: TrainingPlanAssistantSessionService) {}

  async execute(personId: string, noticeVersion: string) {
    this.logger.log(
      'CreateTrainingPlanAssistantSessionCommand -> execute -> params:',
      { params: { noticeVersion, personId } },
    );
    const created = await this.sessions.createOrResume(personId, noticeVersion);
    const result = {
      created: created.created,
      response: { data: created.session },
    };
    this.logger.log(
      'CreateTrainingPlanAssistantSessionCommand -> execute -> return:',
      { data: { created: result.created, sessionId: created.session.id } },
    );
    return result;
  }
}

@Injectable()
export class SendTrainingPlanAssistantMessageCommand {
  private readonly logger = new Logger(
    SendTrainingPlanAssistantMessageCommand.name,
  );
  constructor(private readonly sessions: TrainingPlanAssistantSessionService) {}

  async execute(
    personId: string,
    expectedVersion: number,
    clientMessageId: string,
    text: string,
  ): Promise<TrainingPlanAssistantSessionResponse> {
    this.logger.log(
      'SendTrainingPlanAssistantMessageCommand -> execute -> params:',
      {
        params: {
          clientMessageId,
          expectedVersion,
          personId,
          textLength: text.length,
        },
      },
    );
    const session = await this.sessions.sendMessage(
      personId,
      expectedVersion,
      clientMessageId,
      text,
    );
    const result = { data: session };
    this.logger.log(
      'SendTrainingPlanAssistantMessageCommand -> execute -> return:',
      { data: { sessionId: session.id, version: session.version } },
    );
    return result;
  }
}

@Injectable()
export class GenerateTrainingPlanAssistantDraftCommand {
  private readonly logger = new Logger(
    GenerateTrainingPlanAssistantDraftCommand.name,
  );
  constructor(private readonly sessions: TrainingPlanAssistantSessionService) {}

  async execute(
    personId: string,
    expectedVersion: number,
    idempotencyKey: string,
    adjustment?: string,
  ): Promise<TrainingPlanAssistantSessionResponse> {
    this.logger.log(
      'GenerateTrainingPlanAssistantDraftCommand -> execute -> params:',
      {
        params: {
          adjustmentPresent: adjustment !== undefined,
          expectedVersion,
          personId,
        },
      },
    );
    const session = await this.sessions.generateDraft(
      personId,
      expectedVersion,
      idempotencyKey,
      adjustment,
    );
    const result = { data: session };
    this.logger.log(
      'GenerateTrainingPlanAssistantDraftCommand -> execute -> return:',
      { data: { sessionId: session.id, version: session.version } },
    );
    return result;
  }
}

@Injectable()
export class ConfirmTrainingPlanAssistantSessionCommand {
  private readonly logger = new Logger(
    ConfirmTrainingPlanAssistantSessionCommand.name,
  );
  constructor(private readonly sessions: TrainingPlanAssistantSessionService) {}

  async execute(
    personId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<{
    replay: boolean;
    response: TrainingPlanAssistantConfirmationResponse;
  }> {
    this.logger.log(
      'ConfirmTrainingPlanAssistantSessionCommand -> execute -> params:',
      { params: { expectedVersion, personId } },
    );
    const confirmation = await this.sessions.confirm(
      personId,
      expectedVersion,
      idempotencyKey,
    );
    const result = {
      replay: confirmation.replay,
      response: {
        data: {
          catalogEntryId: confirmation.catalogEntryId,
          trainingPlanId: confirmation.trainingPlanId,
        },
      },
    };
    this.logger.log(
      'ConfirmTrainingPlanAssistantSessionCommand -> execute -> return:',
      { data: { ...result.response.data, replay: result.replay } },
    );
    return result;
  }
}

@Injectable()
export class DeleteTrainingPlanAssistantSessionCommand {
  private readonly logger = new Logger(
    DeleteTrainingPlanAssistantSessionCommand.name,
  );
  constructor(private readonly sessions: TrainingPlanAssistantSessionService) {}

  async execute(personId: string): Promise<void> {
    this.logger.log(
      'DeleteTrainingPlanAssistantSessionCommand -> execute -> params:',
      { params: { personId } },
    );
    await this.sessions.abandon(personId);
    this.logger.log(
      'DeleteTrainingPlanAssistantSessionCommand -> execute -> completed:',
      { data: { personId } },
    );
  }
}
