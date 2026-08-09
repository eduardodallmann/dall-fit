import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MongoPersonRepository } from '~/person/repositories/mongo-person.repository';
import { PersonRepository } from '~/person/repositories/person.repository';
import {
  PersonDocument,
  PersonSchema,
} from '~/person/repositories/person.schema';
import { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';
import { FindPersonByIdService } from '~/person/services/find-person-by-id.service';
import { UpdatePersonThemeService } from '~/person/services/update-person-theme.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PersonDocument.name, schema: PersonSchema },
    ]),
  ],
  providers: [
    FindOrCreatePersonService,
    FindPersonByIdService,
    UpdatePersonThemeService,
    MongoPersonRepository,
    {
      provide: PersonRepository,
      useExisting: MongoPersonRepository,
    },
  ],
  exports: [
    FindOrCreatePersonService,
    FindPersonByIdService,
    UpdatePersonThemeService,
  ],
})
export class PersonModule {}
