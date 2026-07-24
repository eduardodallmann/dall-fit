import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersonRepository } from '~/person/repositories/person.repository';
import { FindPersonByIdService } from '~/person/services/find-person-by-id.service';

describe('FindPersonByIdService', () => {
  const personRepository = { findById: vi.fn() };
  let service: FindPersonByIdService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FindPersonByIdService(
      personRepository as unknown as PersonRepository,
    );
  });

  it('returns the person found by the repository', async () => {
    const person = { id: 'person-001' };
    personRepository.findById.mockResolvedValue(person);

    const result = await service.execute('person-001');

    expect(result).toBe(person);
    expect(personRepository.findById).toHaveBeenCalledWith('person-001');
  });

  it('preserves an empty repository result', async () => {
    personRepository.findById.mockResolvedValue(null);

    await expect(service.execute('person-missing')).resolves.toBeNull();
  });
});
