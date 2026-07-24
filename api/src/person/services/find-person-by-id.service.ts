import { Injectable, Logger } from '@nestjs/common';

import type { PersonEntity } from '~/person/domain/person.entity';
import { PersonRepository } from '~/person/repositories/person.repository';

@Injectable()
export class FindPersonByIdService {
  private readonly logger = new Logger(FindPersonByIdService.name);

  constructor(private readonly personRepository: PersonRepository) {}

  async execute(personId: string): Promise<PersonEntity | null> {
    this.logger.log('FindPersonByIdService -> execute -> params:', {
      params: { personId },
    });

    const person = await this.personRepository.findById(personId);
    const data = { found: person !== null, personId };

    this.logger.log(
      'FindPersonByIdService -> execute -> personRepository return:',
      { data },
    );

    const result = person;
    this.logger.log('FindPersonByIdService -> execute -> return:', { data });

    return result;
  }
}
