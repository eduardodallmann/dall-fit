import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type {
  AssistantConfirmationReceipt,
  AssistantOperationReceipt,
  AssistantSessionEntity,
  AssistantStoredMessage,
} from '~/training-plan-assistant/domain/training-plan-assistant.types';
import { TrainingPlanAssistantRepository } from '~/training-plan-assistant/repositories/training-plan-assistant.repository';
import {
  TrainingPlanAssistantReceiptDocument,
  TrainingPlanAssistantSessionDocument,
} from '~/training-plan-assistant/repositories/training-plan-assistant.schema';

interface PlainAssistantSession {
  _id: Types.ObjectId;
  active: boolean;
  answers: Record<string, string>;
  catalogVersion: string;
  createdAt: Date;
  currentQuestionKey: string | null;
  expiresAt: Date;
  generatedDraft: AssistantSessionEntity['generatedDraft'];
  invalidAttempts: Record<string, number>;
  knowledgeVersion: string;
  materialization: AssistantSessionEntity['materialization'];
  messages: AssistantStoredMessage[];
  model: string;
  noticeVersion: string;
  operationKeys: Record<string, AssistantOperationReceipt>;
  personId: Types.ObjectId;
  promptVersion: string;
  provider: string;
  screeningOutcome: AssistantSessionEntity['screeningOutcome'];
  status: AssistantSessionEntity['status'];
  updatedAt: Date;
  version: number;
}

interface PlainReceipt {
  catalogEntryId: Types.ObjectId;
  expiresAt: Date;
  idempotencyHash: string;
  personId: Types.ObjectId;
  trainingPlanId: Types.ObjectId;
}

@Injectable()
export class MongoTrainingPlanAssistantRepository extends TrainingPlanAssistantRepository {
  private readonly logger = new Logger(
    MongoTrainingPlanAssistantRepository.name,
  );

  constructor(
    @InjectModel(TrainingPlanAssistantSessionDocument.name)
    private readonly sessionModel: Model<TrainingPlanAssistantSessionDocument>,
    @InjectModel(TrainingPlanAssistantReceiptDocument.name)
    private readonly receiptModel: Model<TrainingPlanAssistantReceiptDocument>,
  ) {
    super();
  }

  async create(
    session: Omit<AssistantSessionEntity, 'id'>,
  ): Promise<AssistantSessionEntity> {
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> create -> params:',
      { params: { personId: session.personId, status: session.status } },
    );
    const document = new this.sessionModel({
      ...session,
      messages: [...session.messages],
    });
    await document.save();
    const result = this.mapSession(
      document.toObject() as unknown as PlainAssistantSession,
    );
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> create -> return:',
      { data: { sessionId: result.id, status: result.status } },
    );
    return result;
  }

  async findActive(personId: string): Promise<AssistantSessionEntity | null> {
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> findActive -> params:',
      { params: { personId } },
    );
    const document = await this.sessionModel
      .findOne({ active: true, personId })
      .lean<PlainAssistantSession>()
      .exec();
    const result = document === null ? null : this.mapSession(document);
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> findActive -> return:',
      { data: { found: result !== null, personId } },
    );
    return result;
  }

  async save(
    session: AssistantSessionEntity,
    expectedVersion: number,
  ): Promise<AssistantSessionEntity | null> {
    this.logger.log('MongoTrainingPlanAssistantRepository -> save -> params:', {
      params: {
        expectedVersion,
        sessionId: session.id,
        status: session.status,
      },
    });
    const document = await this.sessionModel
      .findOneAndUpdate(
        {
          _id: session.id,
          active: true,
          personId: session.personId,
          version: expectedVersion,
        },
        {
          $set: {
            active: session.active,
            answers: session.answers,
            catalogVersion: session.catalogVersion,
            currentQuestionKey: session.currentQuestionKey,
            expiresAt: session.expiresAt,
            generatedDraft: session.generatedDraft,
            invalidAttempts: session.invalidAttempts,
            knowledgeVersion: session.knowledgeVersion,
            materialization: session.materialization,
            messages: session.messages,
            model: session.model,
            noticeVersion: session.noticeVersion,
            operationKeys: session.operationKeys,
            promptVersion: session.promptVersion,
            provider: session.provider,
            screeningOutcome: session.screeningOutcome,
            status: session.status,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean<PlainAssistantSession>()
      .exec();
    const result = document === null ? null : this.mapSession(document);
    this.logger.log('MongoTrainingPlanAssistantRepository -> save -> return:', {
      data: { saved: result !== null, sessionId: session.id },
    });
    return result;
  }

  async deleteActive(personId: string): Promise<void> {
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> deleteActive -> params:',
      { params: { personId } },
    );
    await this.sessionModel.deleteOne({ active: true, personId }).exec();
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> deleteActive -> completed:',
      { data: { personId } },
    );
  }

  async findReceipt(
    personId: string,
    idempotencyHash: string,
  ): Promise<AssistantConfirmationReceipt | null> {
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> findReceipt -> params:',
      { params: { idempotencyHash, personId } },
    );
    const document = await this.receiptModel
      .findOne({ idempotencyHash, personId, expiresAt: { $gt: new Date() } })
      .lean<PlainReceipt>()
      .exec();
    const result = document === null ? null : this.mapReceipt(document);
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> findReceipt -> return:',
      { data: { found: result !== null, personId } },
    );
    return result;
  }

  async createReceipt(
    receipt: AssistantConfirmationReceipt,
  ): Promise<AssistantConfirmationReceipt | null> {
    this.logger.log(
      'MongoTrainingPlanAssistantRepository -> createReceipt -> params:',
      { params: { personId: receipt.personId } },
    );
    try {
      const document = await this.receiptModel.create(receipt);
      const result = this.mapReceipt(document.toObject());
      this.logger.log(
        'MongoTrainingPlanAssistantRepository -> createReceipt -> return:',
        { data: { created: true, personId: receipt.personId } },
      );
      return result;
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        this.logger.warn(
          'MongoTrainingPlanAssistantRepository -> createReceipt -> duplicate branch:',
          { data: { personId: receipt.personId } },
        );
        return null;
      }
      throw error;
    }
  }

  private mapSession(document: PlainAssistantSession): AssistantSessionEntity {
    const result: AssistantSessionEntity = {
      active: document.active,
      answers: document.answers ?? {},
      catalogVersion: document.catalogVersion,
      createdAt: document.createdAt,
      currentQuestionKey: document.currentQuestionKey,
      expiresAt: document.expiresAt,
      generatedDraft: document.generatedDraft,
      id: document._id.toString(),
      invalidAttempts: document.invalidAttempts ?? {},
      knowledgeVersion: document.knowledgeVersion,
      materialization: document.materialization,
      messages: document.messages,
      model: document.model,
      noticeVersion: document.noticeVersion,
      operationKeys: document.operationKeys ?? {},
      personId: document.personId.toString(),
      promptVersion: document.promptVersion,
      provider: document.provider,
      screeningOutcome: document.screeningOutcome,
      status: document.status,
      updatedAt: document.updatedAt,
      version: document.version,
    };
    return result;
  }

  private mapReceipt(document: PlainReceipt): AssistantConfirmationReceipt {
    const result = {
      catalogEntryId: document.catalogEntryId.toString(),
      expiresAt: document.expiresAt,
      idempotencyHash: document.idempotencyHash,
      personId: document.personId.toString(),
      trainingPlanId: document.trainingPlanId.toString(),
    };
    return result;
  }

  private isDuplicateKey(error: unknown): boolean {
    const result =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11_000;
    return result;
  }
}
