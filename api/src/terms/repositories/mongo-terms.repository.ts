import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import type {
  CollectionResponse,
  TermsAcceptance,
  TermsDocument,
  TermsReference,
  TermsSummary,
} from '@dall-fit/types';

import { termsLog } from '~/terms/domain/terms-log';
import {
  TermsRepository,
  type PreparedTerms,
} from '~/terms/repositories/terms.repository';
import {
  TERMS_ACCEPTANCE_MODEL,
  TERMS_MODEL,
  type StoredAcceptance,
  type StoredTerms,
} from '~/terms/repositories/terms.schema';

function document(record: StoredTerms): TermsDocument {
  const {
    _id,
    createdByPersonId: _author,
    publishedByPersonId: _publisher,
    ...fields
  } = record;
  return { ...fields, id: _id.toString() };
}
function acceptance(record: StoredAcceptance): TermsAcceptance {
  const { _id, personId: _person, ...fields } = record;
  return { ...fields, id: _id.toString() };
}

@Injectable()
export class MongoTermsRepository extends TermsRepository {
  private readonly logger = new Logger(MongoTermsRepository.name);
  constructor(
    @InjectModel(TERMS_MODEL) private readonly documents: Model<StoredTerms>,
    @InjectModel(TERMS_ACCEPTANCE_MODEL)
    private readonly acceptances: Model<StoredAcceptance>,
  ) {
    super();
  }

  async currentReference(): Promise<TermsReference | null> {
    termsLog(this.logger, 'MongoTermsRepository', 'currentReference', 'params');
    const record = await this.documents
      .findOne({ state: 'published' })
      .sort({ publicationNumber: -1 })
      .select('_id publicationNumber contentHash')
      .read('primary')
      .lean()
      .exec();
    const result =
      record?.publicationNumber === undefined
        ? null
        : {
            id: record._id.toString(),
            publicationNumber: record.publicationNumber,
            contentHash: record.contentHash,
          };
    termsLog(
      this.logger,
      'MongoTermsRepository',
      'currentReference',
      'return',
      { number: result?.publicationNumber },
    );
    return result;
  }
  async find(id: string): Promise<TermsDocument | null> {
    termsLog(this.logger, 'MongoTermsRepository', 'find', 'params', { id });
    const record = await this.documents.findById(id).lean().exec();
    const result = record === null ? null : document(record);
    termsLog(this.logger, 'MongoTermsRepository', 'find', 'return', {
      found: result !== null,
    });
    return result;
  }
  async list(page: number): Promise<CollectionResponse<TermsSummary>> {
    termsLog(this.logger, 'MongoTermsRepository', 'list', 'params', { page });
    const [records, total] = await Promise.all([
      this.documents
        .find()
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .select('-bodyHtml -contentHtml')
        .lean()
        .exec(),
      this.documents.countDocuments(),
    ]);
    const result = { data: records.map(document), page, pageSize: 20, total };
    termsLog(this.logger, 'MongoTermsRepository', 'list', 'return', { total });
    return result;
  }
  async create(
    fields: PreparedTerms,
    personId: string,
  ): Promise<TermsDocument> {
    termsLog(this.logger, 'MongoTermsRepository', 'create', 'params');
    const now = new Date().toISOString();
    const record = await this.documents.create({
      ...fields,
      state: 'draft',
      version: 0,
      createdAt: now,
      updatedAt: now,
      createdByPersonId: personId,
    });
    const result = document(record.toObject());
    termsLog(this.logger, 'MongoTermsRepository', 'create', 'return', {
      id: result.id,
    });
    return result;
  }
  async update(
    id: string,
    version: number,
    fields: PreparedTerms,
  ): Promise<TermsDocument | null> {
    termsLog(this.logger, 'MongoTermsRepository', 'update', 'params', {
      id,
      version,
    });
    const record = await this.documents
      .findOneAndUpdate(
        { _id: id, version, state: 'draft' },
        {
          $set: { ...fields, updatedAt: new Date().toISOString() },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    const result = record === null ? null : document(record);
    termsLog(this.logger, 'MongoTermsRepository', 'update', 'return', {
      changed: result !== null,
    });
    return result;
  }
  async publish(
    id: string,
    version: number,
    number: number,
    personId: string,
  ): Promise<TermsDocument | null> {
    termsLog(this.logger, 'MongoTermsRepository', 'publish', 'params', {
      id,
      version,
      number,
    });
    const now = new Date().toISOString();
    const record = await this.documents
      .findOneAndUpdate(
        { _id: id, version, state: 'draft' },
        {
          $set: {
            state: 'published',
            publicationNumber: number,
            publishedAt: now,
            updatedAt: now,
            publishedByPersonId: personId,
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    const result = record === null ? null : document(record);
    termsLog(this.logger, 'MongoTermsRepository', 'publish', 'return', {
      published: result !== null,
    });
    return result;
  }
  async remove(id: string, version: number): Promise<boolean> {
    termsLog(this.logger, 'MongoTermsRepository', 'remove', 'params', {
      id,
      version,
    });
    const deleted = await this.documents
      .deleteOne({ _id: id, version, state: 'draft' })
      .exec();
    const result = deleted.deletedCount === 1;
    termsLog(this.logger, 'MongoTermsRepository', 'remove', 'return', {
      deleted: result,
    });
    return result;
  }
  async receipt(
    personId: string,
    termsVersionId: string,
  ): Promise<TermsAcceptance | null> {
    termsLog(this.logger, 'MongoTermsRepository', 'receipt', 'params', {
      termsVersionId,
    });
    const record = await this.acceptances
      .findOne({ personId, termsVersionId })
      .lean()
      .exec();
    const result = record === null ? null : acceptance(record);
    termsLog(this.logger, 'MongoTermsRepository', 'receipt', 'return', {
      found: result !== null,
    });
    return result;
  }
  async record(
    personId: string,
    receipt: Omit<TermsAcceptance, 'id'>,
  ): Promise<{ acceptance: TermsAcceptance; created: boolean }> {
    termsLog(this.logger, 'MongoTermsRepository', 'record', 'params', {
      number: receipt.publicationNumber,
    });
    const record = await this.acceptances
      .findOneAndUpdate(
        { personId, termsVersionId: receipt.termsVersionId },
        { $setOnInsert: { ...receipt, personId } },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: true,
          runValidators: true,
        },
      )
      .exec();
    if (record.value === null)
      throw new Error('Terms receipt was not persisted.');
    const result = {
      acceptance: acceptance(record.value.toObject()),
      created: record.lastErrorObject?.updatedExisting !== true,
    };
    termsLog(this.logger, 'MongoTermsRepository', 'record', 'return', {
      created: result.created,
    });
    return result;
  }
  async receipts(
    personId: string,
    page: number,
  ): Promise<CollectionResponse<TermsAcceptance>> {
    termsLog(this.logger, 'MongoTermsRepository', 'receipts', 'params', {
      page,
    });
    const [records, total] = await Promise.all([
      this.acceptances
        .find({ personId })
        .sort({ acceptedAt: -1, _id: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean()
        .exec(),
      this.acceptances.countDocuments({ personId }),
    ]);
    const result = { data: records.map(acceptance), page, pageSize: 20, total };
    termsLog(this.logger, 'MongoTermsRepository', 'receipts', 'return', {
      total,
    });
    return result;
  }
}
