import type { NewPerson, PersonEntity } from '~/person/domain/person.entity';

export interface FindOrCreatePersonResult {
  created: boolean;
  person: PersonEntity;
}

export abstract class PersonRepository {
  abstract findById(id: string): Promise<PersonEntity | null>;

  abstract findOrCreateByGoogleSubject(
    person: NewPerson,
  ): Promise<FindOrCreatePersonResult>;
}
