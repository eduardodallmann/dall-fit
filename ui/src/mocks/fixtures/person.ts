import type { Person } from '@dall-fit/types';

export const authenticatedPersonFixture: Person = {
  id: 'person-fixture-001',
  name: 'Alex Runner',
  email: 'alex.runner@example.test',
  photoUrl: 'http://127.0.0.1:3100/icons.svg',
  createdAt: '2026-07-24T12:00:00.000Z',
  updatedAt: '2026-07-24T12:00:00.000Z',
};

export const adminPersonFixture: Person = {
  ...authenticatedPersonFixture,
  isAdmin: true,
};
