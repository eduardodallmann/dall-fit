import { Injectable, Logger } from '@nestjs/common';

import type { NewPerson } from '~/person/domain/person.entity';
import {
  PersonRepository,
  type FindOrCreatePersonResult,
} from '~/person/repositories/person.repository';

@Injectable()
export class FindOrCreatePersonService {
  private readonly logger = new Logger(FindOrCreatePersonService.name);

  constructor(private readonly personRepository: PersonRepository) {}

  async execute(person: NewPerson): Promise<FindOrCreatePersonResult> {
    this.logger.log('FindOrCreatePersonService -> execute -> params:', {
      params: { fields: Object.keys(person) },
    });

    const repositoryResult =
      await this.personRepository.findOrCreateByGoogleSubject(person);

    this.logger.log(
      'FindOrCreatePersonService -> execute -> personRepository return:',
      {
        data: {
          created: repositoryResult.created,
          personId: repositoryResult.person.id,
        },
      },
    );

    const result = repositoryResult;
    this.logger.log('FindOrCreatePersonService -> execute -> return:', {
      data: {
        created: result.created,
        personId: result.person.id,
      },
    });

    return result;
  }
}
