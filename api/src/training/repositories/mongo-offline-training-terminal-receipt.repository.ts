import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type {
  NewOfflineTrainingTerminalReceipt,
  StoredOfflineTrainingTerminalReceipt,
} from '~/training/domain/offline-training-terminal.types';
import { OfflineTrainingTerminalReceiptRepository } from '~/training/repositories/offline-training-terminal-receipt.repository';
import { OfflineTrainingTerminalReceiptDocument } from '~/training/repositories/offline-training-terminal-receipt.schema';

interface PlainTerminalReceipt {
  _id: Types.ObjectId;
  acceptedAt: Date;
  contentHash: string;
  createdAt: Date;
  executionId: string;
  personId: Types.ObjectId;
  revision: number;
  terminalState: 'cancelled' | 'completed';
  updatedAt: Date;
  workoutExecutionId?: Types.ObjectId;
}

@Injectable()
export class MongoOfflineTrainingTerminalReceiptRepository extends OfflineTrainingTerminalReceiptRepository {
  private readonly logger = new Logger(
    MongoOfflineTrainingTerminalReceiptRepository.name,
  );

  constructor(
    @InjectModel(OfflineTrainingTerminalReceiptDocument.name)
    private readonly model: Model<OfflineTrainingTerminalReceiptDocument>,
  ) {
    super();
  }

  async find(
    personId: string,
    executionId: string,
  ): Promise<StoredOfflineTrainingTerminalReceipt | null> {
    this.logger.log(
      'MongoOfflineTrainingTerminalReceiptRepository -> find -> params:',
      { params: { scoped: true } },
    );
    const document = await this.model
      .findOne({
        executionId,
        personId: new Types.ObjectId(personId),
      })
      .lean<PlainTerminalReceipt>()
      .exec();
    const result = document === null ? null : this.map(document);
    this.logger.log(
      'MongoOfflineTrainingTerminalReceiptRepository -> find -> return:',
      { data: { found: result !== null } },
    );
    return result;
  }

  async create(
    input: NewOfflineTrainingTerminalReceipt,
  ): Promise<StoredOfflineTrainingTerminalReceipt> {
    this.logger.log(
      'MongoOfflineTrainingTerminalReceiptRepository -> create -> params:',
      { params: { terminalState: input.terminalState } },
    );
    const insert = {
      ...input,
      personId: new Types.ObjectId(input.personId),
      ...(input.workoutExecutionId === undefined
        ? {}
        : { workoutExecutionId: new Types.ObjectId(input.workoutExecutionId) }),
    };
    const document = await this.model
      .findOneAndUpdate(
        { executionId: input.executionId, personId: insert.personId },
        { $setOnInsert: insert },
        { returnDocument: 'after', runValidators: true, upsert: true },
      )
      .lean<PlainTerminalReceipt>()
      .exec();
    if (document === null) throw new Error('Terminal receipt upsert failed.');
    const result = this.map(document);
    this.logger.log(
      'MongoOfflineTrainingTerminalReceiptRepository -> create -> return:',
      { data: { terminalState: result.terminalState } },
    );
    return result;
  }

  private map(
    document: PlainTerminalReceipt,
  ): StoredOfflineTrainingTerminalReceipt {
    this.logger.log(
      'MongoOfflineTrainingTerminalReceiptRepository -> map -> params:',
      { params: { terminalState: document.terminalState } },
    );
    const result: StoredOfflineTrainingTerminalReceipt = {
      acceptedAt: document.acceptedAt,
      contentHash: document.contentHash,
      createdAt: document.createdAt,
      executionId: document.executionId,
      id: document._id.toString(),
      personId: document.personId.toString(),
      revision: document.revision,
      terminalState: document.terminalState,
      updatedAt: document.updatedAt,
      ...(document.workoutExecutionId === undefined
        ? {}
        : { workoutExecutionId: document.workoutExecutionId.toString() }),
    };
    this.logger.log(
      'MongoOfflineTrainingTerminalReceiptRepository -> map -> return:',
      { data: { terminalState: result.terminalState } },
    );
    return result;
  }
}
