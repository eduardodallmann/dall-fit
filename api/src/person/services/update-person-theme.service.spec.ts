import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersonRepository } from '~/person/repositories/person.repository';
import { UpdatePersonThemeService } from '~/person/services/update-person-theme.service';

describe('UpdatePersonThemeService', () => {
  const personRepository = { updateTheme: vi.fn() };
  let service: UpdatePersonThemeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UpdatePersonThemeService(
      personRepository as unknown as PersonRepository,
    );
  });

  it('returns the person updated atomically by the repository', async () => {
    const person = { id: 'person-001', configs: { theme: 'dark' } };
    personRepository.updateTheme.mockResolvedValue(person);

    const result = await service.execute('person-001', 'dark');

    expect(result).toBe(person);
    expect(personRepository.updateTheme).toHaveBeenCalledWith(
      'person-001',
      'dark',
    );
  });

  it('rejects a session whose person disappears before the update', async () => {
    personRepository.updateTheme.mockResolvedValue(null);

    await expect(service.execute('person-001', 'light')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
