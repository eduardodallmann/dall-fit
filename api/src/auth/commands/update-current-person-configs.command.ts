import { Injectable, Logger } from '@nestjs/common';

import type {
  Person,
  UpdateCurrentPersonConfigsRequest,
  UpdateCurrentPersonConfigsResponse,
} from '@dall-fit/types';

import type { PersonEntity } from '~/person/domain/person.entity';
import { UpdatePersonThemeService } from '~/person/services/update-person-theme.service';

@Injectable()
export class UpdateCurrentPersonConfigsCommand {
  private readonly logger = new Logger(UpdateCurrentPersonConfigsCommand.name);

  constructor(
    private readonly updatePersonThemeService: UpdatePersonThemeService,
  ) {}

  async execute(
    person: PersonEntity,
    configs: UpdateCurrentPersonConfigsRequest,
  ): Promise<UpdateCurrentPersonConfigsResponse> {
    this.logger.log('UpdateCurrentPersonConfigsCommand -> execute -> params:', {
      params: { fields: Object.keys(configs), personId: person.id },
    });

    const serviceParams = { personId: person.id, theme: configs.theme };
    this.logger.log(
      'UpdateCurrentPersonConfigsCommand -> execute -> serviceParams prepared:',
      { data: { fields: ['configs.theme'], personId: person.id } },
    );

    const updatedPerson = await this.updatePersonThemeService.execute(
      serviceParams.personId,
      serviceParams.theme,
    );
    this.logger.log(
      'UpdateCurrentPersonConfigsCommand -> execute -> updatePersonThemeService return:',
      { data: { personId: updatedPerson.id } },
    );

    const publicPerson: Person = {
      configs: updatedPerson.configs,
      id: updatedPerson.id,
      name: updatedPerson.name,
      email: updatedPerson.email,
      photoUrl: updatedPerson.photoUrl,
      ...(updatedPerson.isAdmin === true ? { isAdmin: true as const } : {}),
      createdAt: updatedPerson.createdAt,
      updatedAt: updatedPerson.updatedAt,
    };
    this.logger.log(
      'UpdateCurrentPersonConfigsCommand -> execute -> response prepared:',
      {
        data: { fields: Object.keys(publicPerson), personId: publicPerson.id },
      },
    );

    const result = { data: publicPerson };
    this.logger.log('UpdateCurrentPersonConfigsCommand -> execute -> return:', {
      data: { fields: Object.keys(publicPerson), personId: publicPerson.id },
    });

    return result;
  }
}
