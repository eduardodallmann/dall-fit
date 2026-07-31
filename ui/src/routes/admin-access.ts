import { redirect } from '@tanstack/react-router';

import type { Person } from '@dall-fit/types';

export function assertAdminAccess(person: Person): void {
  if (person.isAdmin === true) {
    return;
  }

  redirect({ replace: true, throw: true, to: '/me' });
}
