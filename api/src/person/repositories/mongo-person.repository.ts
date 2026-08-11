import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type { Theme } from '@dall-fit/types';

import type { NewPerson, PersonEntity } from '~/person/domain/person.entity';
import {
  PersonRepository,
  type FindOrCreatePersonResult,
} from '~/person/repositories/person.repository';
import { PersonDocument } from '~/person/repositories/person.schema';

interface PlainPerson {
  _id: Types.ObjectId;
  configs?: { theme?: Theme };
  googleSubject: string;
  name: string;
  email: string;
  photoUrl: string | null;
  isAdmin?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const publicProjection = {
  configs: 1,
  googleSubject: 1,
  name: 1,
  email: 1,
  photoUrl: 1,
  isAdmin: 1,
  createdAt: 1,
  updatedAt: 1,
};

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

    const document = await this.personModel
      .findById(id)
      .select(publicProjection)
      .lean<PlainPerson>()
      .exec();
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
      .select(publicProjection)
      .lean<PlainPerson>()
      .exec();

    this.logger.log(
      'MongoPersonRepository -> findOrCreateByGoogleSubject -> findOne return:',
      { data: { found: existingDocument !== null } },
    );

    if (existingDocument !== null) {
      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> existingPerson branch:',
        { data: { personId: existingDocument._id.toString() } },
      );

      const changed =
        existingDocument.name !== person.name ||
        existingDocument.email !== person.email ||
        existingDocument.photoUrl !== person.photoUrl;
      const synchronizedDocument = changed
        ? await this.personModel
            .findOneAndUpdate(
              {
                googleSubject: person.googleSubject,
                $or: [
                  { email: { $ne: person.email } },
                  { name: { $ne: person.name } },
                  { photoUrl: { $ne: person.photoUrl } },
                ],
              },
              {
                $set: {
                  email: person.email,
                  name: person.name,
                  photoUrl: person.photoUrl,
                },
              },
              { returnDocument: 'after', runValidators: true },
            )
            .select(publicProjection)
            .lean<PlainPerson>()
            .exec()
        : existingDocument;
      const currentDocument =
        synchronizedDocument ??
        (await this.personModel
          .findOne({ googleSubject: person.googleSubject })
          .select(publicProjection)
          .lean<PlainPerson>()
          .orFail()
          .exec());
      this.logger.log(
        'MongoPersonRepository -> findOrCreateByGoogleSubject -> synchronizeProviderProfile completed:',
        {
          data: {
            changed: synchronizedDocument !== null && changed,
            personId: currentDocument._id.toString(),
          },
        },
      );

      const result = {
        created: false,
        person: this.mapDocument(currentDocument),
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
        person: this.mapDocument(createdDocument.toObject()),
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
        .select(publicProjection)
        .lean<PlainPerson>()
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

  async updateTheme(
    personId: string,
    theme: Theme,
  ): Promise<PersonEntity | null> {
    this.logger.log('MongoPersonRepository -> updateTheme -> params:', {
      params: { fields: ['configs.theme'], personId },
    });

    const document = await this.personModel
      .findByIdAndUpdate(
        personId,
        { $set: { 'configs.theme': theme } },
        { returnDocument: 'after', runValidators: true },
      )
      .select(publicProjection)
      .lean<PlainPerson>()
      .exec();
    const data = { found: document !== null, personId };
    this.logger.log(
      'MongoPersonRepository -> updateTheme -> mongoose return:',
      { data },
    );

    const result = document === null ? null : this.mapDocument(document);
    this.logger.log('MongoPersonRepository -> updateTheme -> return:', {
      data,
    });

    return result;
  }

  private mapDocument(document: PlainPerson): PersonEntity {
    this.logger.log('MongoPersonRepository -> mapDocument -> params:', {
      params: { personId: document._id.toString() },
    });

    const result = {
      configs:
        document.configs?.theme === undefined
          ? {}
          : { theme: document.configs.theme },
      id: document._id.toString(),
      googleSubject: document.googleSubject,
      name: document.name,
      email: document.email,
      photoUrl: document.photoUrl,
      ...(document.isAdmin === true ? { isAdmin: true as const } : {}),
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
