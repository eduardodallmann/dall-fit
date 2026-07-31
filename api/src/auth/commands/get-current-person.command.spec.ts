import { describe, expect, it } from 'vitest';

import { GetCurrentPersonCommand } from '~/auth/commands/get-current-person.command';

describe('GetCurrentPersonCommand', () => {
  it('removes the Google identifier from the public response', () => {
    const command = new GetCurrentPersonCommand();

    const result = command.execute({
      id: 'person-001',
      googleSubject: 'google-secret-subject',
      name: 'Alex Runner',
      email: 'alex.runner@example.test',
      photoUrl: null,
      createdAt: '2026-07-24T12:00:00.000Z',
      updatedAt: '2026-07-24T12:00:00.000Z',
    });

    expect(result.data).toEqual({
      id: 'person-001',
      name: 'Alex Runner',
      email: 'alex.runner@example.test',
      photoUrl: null,
      createdAt: '2026-07-24T12:00:00.000Z',
      updatedAt: '2026-07-24T12:00:00.000Z',
    });
    expect(result.data).not.toHaveProperty('googleSubject');
    expect(result.data).not.toHaveProperty('isAdmin');
  });

  it('includes the admin flag without exposing the Google identifier', () => {
    const command = new GetCurrentPersonCommand();

    const result = command.execute({
      id: 'person-admin-001',
      googleSubject: 'google-admin-subject',
      name: 'Admin Runner',
      email: 'admin.runner@example.test',
      photoUrl: null,
      isAdmin: true,
      createdAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:00:00.000Z',
    });

    expect(result.data).toMatchObject({
      id: 'person-admin-001',
      isAdmin: true,
    });
    expect(result.data).not.toHaveProperty('googleSubject');
  });
});
