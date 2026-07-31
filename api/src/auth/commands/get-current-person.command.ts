import { Injectable, Logger } from '@nestjs/common';

import type { CurrentPersonResponse, Person } from '@dall-fit/types';

import type { PersonEntity } from '~/person/domain/person.entity';

@Injectable()
export class GetCurrentPersonCommand {
  private readonly logger = new Logger(GetCurrentPersonCommand.name);

  execute(person: PersonEntity): CurrentPersonResponse {
    this.logger.log('GetCurrentPersonCommand -> execute -> params:', {
      params: { personId: person.id },
    });

    const publicPerson: Person = {
      id: person.id,
      name: person.name,
      email: person.email,
      photoUrl: person.photoUrl,
      ...(person.isAdmin === true ? { isAdmin: true as const } : {}),
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };
    this.logger.log(
      'GetCurrentPersonCommand -> execute -> response prepared:',
      {
        data: { fields: Object.keys(publicPerson), personId: publicPerson.id },
      },
    );

    const result = { data: publicPerson };
    this.logger.log('GetCurrentPersonCommand -> execute -> return:', {
      data: { fields: Object.keys(publicPerson), personId: publicPerson.id },
    });

    return result;
  }
}
