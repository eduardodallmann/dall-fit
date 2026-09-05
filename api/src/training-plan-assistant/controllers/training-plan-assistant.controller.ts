import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Post,
  Res,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Response } from 'express';

import type {
  TrainingPlanAssistantConfirmationResponse,
  TrainingPlanAssistantSessionResponse,
} from '@dall-fit/types';

import {
  AssistantConfirmMutation,
  AssistantDraftMutation,
  AssistantMessageMutation,
} from '~/auth/decorators/assistant-mutation';
import { Authenticated } from '~/auth/decorators/authenticated';
import { AuthenticatedMutation } from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type { PersonEntity } from '~/person/domain/person.entity';
import {
  ConfirmTrainingPlanAssistantSessionCommand,
  CreateTrainingPlanAssistantSessionCommand,
  DeleteTrainingPlanAssistantSessionCommand,
  GenerateTrainingPlanAssistantDraftCommand,
  GetTrainingPlanAssistantSessionCommand,
  SendTrainingPlanAssistantMessageCommand,
} from '~/training-plan-assistant/commands/training-plan-assistant.commands';
import {
  CreateAssistantSessionDto,
  GenerateAssistantDraftDto,
  SendAssistantMessageDto,
} from '~/training-plan-assistant/dto/training-plan-assistant.dto';
import { assistantValidationError } from '~/training-plan-assistant/errors/training-plan-assistant.errors';
import { parseResourceVersion } from '~/training-plan/domain/resource-version';

const RESOURCE_VERSION_HEADER = 'x-resource-version';
const IDEMPOTENCY_HEADER = 'idempotency-key';

@Authenticated()
@Controller('training-plan-assistant/session')
export class TrainingPlanAssistantController {
  private readonly logger = new Logger(TrainingPlanAssistantController.name);

  constructor(
    private readonly getCommand: GetTrainingPlanAssistantSessionCommand,
    private readonly createCommand: CreateTrainingPlanAssistantSessionCommand,
    private readonly messageCommand: SendTrainingPlanAssistantMessageCommand,
    private readonly draftCommand: GenerateTrainingPlanAssistantDraftCommand,
    private readonly confirmCommand: ConfirmTrainingPlanAssistantSessionCommand,
    private readonly deleteCommand: DeleteTrainingPlanAssistantSessionCommand,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async get(
    @CurrentPerson() person: PersonEntity,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingPlanAssistantSessionResponse | undefined> {
    this.logger.log('TrainingPlanAssistantController -> get -> params:', {
      params: { personId: person.id },
    });
    const result = await this.getCommand.execute(person.id);
    this.logger.log(
      'TrainingPlanAssistantController -> get -> getCommand return:',
      { data: { found: result !== null, personId: person.id } },
    );
    if (result === null) {
      response.status(204);
      this.logger.log('TrainingPlanAssistantController -> get -> return:', {
        data: { status: 204 },
      });
      return undefined;
    }
    this.logger.log('TrainingPlanAssistantController -> get -> return:', {
      data: { sessionId: result.data.id, status: 200 },
    });
    return result;
  }

  @Post()
  @AuthenticatedMutation()
  async create(
    @CurrentPerson() person: PersonEntity,
    @Body() input: CreateAssistantSessionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingPlanAssistantSessionResponse> {
    this.logger.log('TrainingPlanAssistantController -> create -> params:', {
      params: { noticeVersion: input.noticeVersion, personId: person.id },
    });
    const result = await this.createCommand.execute(
      person.id,
      input.noticeVersion,
    );
    response.status(result.created ? 201 : 200);
    this.logger.log('TrainingPlanAssistantController -> create -> return:', {
      data: { created: result.created, sessionId: result.response.data.id },
    });
    return result.response;
  }

  @Post('messages')
  @AssistantMessageMutation()
  @HttpCode(200)
  async message(
    @CurrentPerson() person: PersonEntity,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Body() input: SendAssistantMessageDto,
  ): Promise<TrainingPlanAssistantSessionResponse> {
    this.logger.log('TrainingPlanAssistantController -> message -> params:', {
      params: {
        clientMessageId: input.clientMessageId,
        personId: person.id,
        textLength: input.text.length,
      },
    });
    const result = await this.messageCommand.execute(
      person.id,
      parseResourceVersion(resourceVersion),
      input.clientMessageId,
      input.text,
    );
    this.logger.log('TrainingPlanAssistantController -> message -> return:', {
      data: { sessionId: result.data.id, version: result.data.version },
    });
    return result;
  }

  @Post('drafts')
  @AssistantDraftMutation()
  @HttpCode(200)
  async draft(
    @CurrentPerson() person: PersonEntity,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @Body() input: GenerateAssistantDraftDto,
  ): Promise<TrainingPlanAssistantSessionResponse> {
    const key = this.parseIdempotencyKey(idempotencyKey);
    const result = await this.draftCommand.execute(
      person.id,
      parseResourceVersion(resourceVersion),
      key,
      input.adjustment,
    );
    this.logger.log('TrainingPlanAssistantController -> draft -> return:', {
      data: { sessionId: result.data.id, version: result.data.version },
    });
    return result;
  }

  @Post('confirm')
  @AssistantConfirmMutation()
  async confirm(
    @CurrentPerson() person: PersonEntity,
    @Headers(RESOURCE_VERSION_HEADER) resourceVersion: string | undefined,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TrainingPlanAssistantConfirmationResponse> {
    const result = await this.confirmCommand.execute(
      person.id,
      parseResourceVersion(resourceVersion),
      this.parseIdempotencyKey(idempotencyKey),
    );
    response.status(result.replay ? 200 : 201);
    this.logger.log('TrainingPlanAssistantController -> confirm -> return:', {
      data: { ...result.response.data, replay: result.replay },
    });
    return result.response;
  }

  @Delete()
  @AuthenticatedMutation()
  @HttpCode(204)
  async delete(@CurrentPerson() person: PersonEntity): Promise<void> {
    this.logger.log('TrainingPlanAssistantController -> delete -> params:', {
      params: { personId: person.id },
    });
    await this.deleteCommand.execute(person.id);
    this.logger.log('TrainingPlanAssistantController -> delete -> completed:', {
      data: { personId: person.id },
    });
  }

  private parseIdempotencyKey(value: string | undefined): string {
    this.logger.log(
      'TrainingPlanAssistantController -> parseIdempotencyKey -> params:',
      { params: { present: value !== undefined } },
    );
    if (value === undefined || !isUUID(value)) throw assistantValidationError();
    const result = value;
    this.logger.log(
      'TrainingPlanAssistantController -> parseIdempotencyKey -> return:',
      { data: { valid: true } },
    );
    return result;
  }
}
