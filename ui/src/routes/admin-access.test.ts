import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import type { Person } from '@dall-fit/types';

import { authenticatedPersonFixture } from '~/mocks/fixtures/person';
import { assertAdminAccess } from '~/routes/admin-access';

describe('assertAdminAccess', () => {
  it('allows a person with the admin flag', () => {
    const person: Person = {
      ...authenticatedPersonFixture,
      isAdmin: true,
    };

    expect(() => assertAdminAccess(person)).not.toThrow();
  });

  it('redirects a person without the admin flag to /dash', () => {
    let thrown: unknown;

    try {
      assertAdminAccess(authenticatedPersonFixture);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(isRedirect(thrown)).toBe(true);

    if (!isRedirect(thrown)) {
      throw new Error('Expected an admin route redirect.');
    }

    expect(thrown.options).toMatchObject({ replace: true, to: '/dash' });
  });
});
