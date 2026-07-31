import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersonRepository } from '~/person/repositories/person.repository';
import { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';

describe('FindOrCreatePersonService', () => {
  const personRepository = {
    findOrCreateByGoogleSubject: vi.fn(),
  };
  const identity = {
    googleSubject: 'google-fixture-001',
    name: 'Alex Runner',
    email: 'alex.runner@example.test',
    photoUrl: null,
  };
  const person = {
    ...identity,
    id: 'person-fixture-001',
    createdAt: '2026-07-24T12:00:00.000Z',
    updatedAt: '2026-07-24T12:00:00.000Z',
  };
  let service: FindOrCreatePersonService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FindOrCreatePersonService(
      personRepository as unknown as PersonRepository,
    );
  });

  it.each([true, false])(
    'returns the repository result when created is %s',
    async (created) => {
      personRepository.findOrCreateByGoogleSubject.mockResolvedValue({
        created,
        person,
      });

      const result = await service.execute(identity);

      expect(result).toEqual({ created, person });
      expect(personRepository.findOrCreateByGoogleSubject).toHaveBeenCalledWith(
        identity,
      );
    },
  );

  it('preserves the admin flag returned for an existing person', async () => {
    const adminPerson = { ...person, isAdmin: true as const };
    personRepository.findOrCreateByGoogleSubject.mockResolvedValue({
      created: false,
      person: adminPerson,
    });

    const result = await service.execute(identity);

    expect(result).toEqual({ created: false, person: adminPerson });
    expect(personRepository.findOrCreateByGoogleSubject).toHaveBeenCalledWith(
      identity,
    );
  });
});
