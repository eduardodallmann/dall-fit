import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import type { Theme } from '@dall-fit/types';

import type { PersonEntity } from '~/person/domain/person.entity';
import { PersonRepository } from '~/person/repositories/person.repository';

@Injectable()
export class UpdatePersonThemeService {
  private readonly logger = new Logger(UpdatePersonThemeService.name);

  constructor(private readonly personRepository: PersonRepository) {}

  async execute(personId: string, theme: Theme): Promise<PersonEntity> {
    this.logger.log('UpdatePersonThemeService -> execute -> params:', {
      params: { fields: ['configs.theme'], personId },
    });

    const repositoryResult = await this.personRepository.updateTheme(
      personId,
      theme,
    );
    this.logger.log(
      'UpdatePersonThemeService -> execute -> personRepository return:',
      { data: { found: repositoryResult !== null, personId } },
    );

    if (repositoryResult === null) {
      this.logger.warn(
        'UpdatePersonThemeService -> execute -> personMissing error:',
        { data: { code: 'AUTHENTICATION_REQUIRED', personId } },
      );
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        details: {},
        message: 'Authentication is required.',
      });
    }

    const result = repositoryResult;
    this.logger.log('UpdatePersonThemeService -> execute -> return:', {
      data: { personId: result.id },
    });

    return result;
  }
}
