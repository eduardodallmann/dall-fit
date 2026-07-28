import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestLoginCommand } from '~/auth/commands/test-login.command';
import type { AuthSessionService } from '~/auth/services/auth-session.service';
import type { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';

describe('TestLoginCommand', () => {
  const findOrCreatePersonService = { execute: vi.fn() };
  const authSessionService = { createSession: vi.fn() };
  const identity = {
    googleSubject: 'google-fixture-001',
    name: 'Alex Runner',
    email: 'alex.runner@example.test',
    photoUrl: null,
  };
  let command: TestLoginCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    findOrCreatePersonService.execute.mockResolvedValue({
      created: true,
      person: { id: 'person-001' },
    });
    authSessionService.createSession.mockResolvedValue({
      maxAgeMs: 600_000,
      token: 'signed-session',
    });
    command = new TestLoginCommand(
      findOrCreatePersonService as unknown as FindOrCreatePersonService,
      authSessionService as unknown as AuthSessionService,
    );
  });

  it.each([true, false])(
    'uses the real person and session services when created is %s',
    async (created) => {
      findOrCreatePersonService.execute.mockResolvedValue({
        created,
        person: { id: 'person-001' },
      });

      const result = await command.execute(identity);

      expect(result).toEqual({
        maxAgeMs: 600_000,
        token: 'signed-session',
      });
      expect(findOrCreatePersonService.execute).toHaveBeenCalledWith(identity);
      expect(authSessionService.createSession).toHaveBeenCalledWith(
        'person-001',
      );
    },
  );
});
