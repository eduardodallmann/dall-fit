import { describe, expect, it, vi } from 'vitest';

import { UpdateCurrentPersonConfigsCommand } from '~/auth/commands/update-current-person-configs.command';
import type { UpdatePersonThemeService } from '~/person/services/update-person-theme.service';

describe('UpdateCurrentPersonConfigsCommand', () => {
  it('updates only the authenticated person theme and maps the public response', async () => {
    const updatedPerson = {
      configs: { theme: 'light' as const },
      createdAt: '2026-07-24T12:00:00.000Z',
      email: 'alex.runner@example.test',
      googleSubject: 'google-secret-subject',
      id: 'person-001',
      name: 'Alex Runner',
      photoUrl: null,
      updatedAt: '2026-08-08T12:00:00.000Z',
    };
    const updatePersonThemeService = {
      execute: vi.fn().mockResolvedValue(updatedPerson),
    };
    const command = new UpdateCurrentPersonConfigsCommand(
      updatePersonThemeService as unknown as UpdatePersonThemeService,
    );

    const result = await command.execute(
      { ...updatedPerson, configs: { theme: 'dark' } },
      { theme: 'light' },
    );

    expect(updatePersonThemeService.execute).toHaveBeenCalledWith(
      'person-001',
      'light',
    );
    expect(result.data).toEqual({
      configs: { theme: 'light' },
      createdAt: '2026-07-24T12:00:00.000Z',
      email: 'alex.runner@example.test',
      id: 'person-001',
      name: 'Alex Runner',
      photoUrl: null,
      updatedAt: '2026-08-08T12:00:00.000Z',
    });
    expect(result.data).not.toHaveProperty('googleSubject');
  });
});
