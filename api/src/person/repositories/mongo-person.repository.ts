import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { NewPerson, PersonEntity } from '~/person/domain/person.entity';
import {
  PersonRepository,
  type FindOrCreatePersonResult,
} from '~/person/repositories/person.repository';
import {
  PersonDocument,
  type PersonHydratedDocument,
} from '~/person/repositories/person.schema';

@Injectable()
export class MongoPersonRepository extends PersonRepository {
  private readonly logger = new Logger(MongoPersonRepository.name);

  constructor(
    @InjectModel(PersonDocument.name)
    private readonly personModel: Model<PersonDocument>,
  ) {
    super();
  }

  async findById(id: string): Promise<PersonEntity | null> {
    this.logger.log('MongoPersonRepository -> findById -> params:', {
      params: { personId: id },
    });

    const document = await this.personModel.findById(id).exec();
    const data = { found: document !== null, personId: id };

    this.logger.log('MongoPersonRepository -> findById -> mongoose return:', {
      data,
    });

    const result = document === null ? null : this.mapDocument(document);
    this.logger.log('MongoPersonRepository -> findById -> return:', {
      data,
    });

    return result;
  }

  async findOrCreateByGoogleSubject(
    person: NewPerson,
  ): Promise<FindOrCreatePersonResult> {
    this.logger.log(
      'MongoPersonRepository -> findOrCreateByGoogleSubject -> params:',
      { params: { operation: 'find-or-create', fields: Object.keys(person) } },
    );

    const existingDocument = await this.personModel
      .findOne({ googleSubject: person.googleSubject })
      .exec();

    this.logger.log(
      'MongoPersonRepository -> findOrCreateByGoogleSubject -> findOne return:',
      { data: { found: existingDocument !== null } },
    );

    if (existingDocument !== null) {
      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> existingPerson branch:',
        { data: { personId: existingDocument.id } },
      );

      const result = {
        created: false,
        person: this.mapDocument(existingDocument),
      };

      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> return:',
        { data: { created: result.created, personId: result.person.id } },
      );

      return result;
    }

    try {
      const createdDocument = await this.personModel.create(person);

      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> create return:',
        { data: { personId: createdDocument.id } },
      );

      const result = {
        created: true,
        person: this.mapDocument(createdDocument),
      };

      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> return:',
        { data: { created: result.created, personId: result.person.id } },
      );

      return result;
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> concurrentCreate branch:',
        { data: { operation: 'load-winner' } },
      );

      const concurrentDocument = await this.personModel
        .findOne({ googleSubject: person.googleSubject })
        .orFail()
        .exec();
      const result = {
        created: false,
        person: this.mapDocument(concurrentDocument),
      };

      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> return:',
        { data: { created: result.created, personId: result.person.id } },
      );

      return result;
    }
  }

  private mapDocument(document: PersonHydratedDocument): PersonEntity {
    this.logger.log('MongoPersonRepository -> mapDocument -> params:', {
      params: { personId: document.id },
    });

    const result = {
      id: document.id,
      googleSubject: document.googleSubject,
      name: document.name,
      email: document.email,
      photoUrl: document.photoUrl,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };

    this.logger.log('MongoPersonRepository -> mapDocument -> return:', {
      data: { personId: result.id, fields: Object.keys(result) },
    });

    return result;
  }
}

function isDuplicateKeyError(error: unknown): error is { code: 11_000 } {
  const result =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11_000;

  return result;
}
