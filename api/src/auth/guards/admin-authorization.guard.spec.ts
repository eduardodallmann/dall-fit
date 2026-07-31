import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { AdminAuthorizationGuard } from '~/auth/guards/admin-authorization.guard';

describe('AdminAuthorizationGuard', () => {
  const request: AuthenticatedRequest = { originalUrl: '/admin-resource' };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  const guard = new AdminAuthorizationGuard();

  beforeEach(() => {
    delete request.currentPerson;
  });

  it('allows the person already loaded by the session guard when they are admin', () => {
    request.currentPerson = {
      id: 'person-admin-001',
      googleSubject: 'google-admin-001',
      name: 'Admin Fixture',
      email: 'admin@example.test',
      photoUrl: null,
      isAdmin: true,
      createdAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:00:00.000Z',
    };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an authenticated person without the admin flag', () => {
    request.currentPerson = {
      id: 'person-common-001',
      googleSubject: 'google-common-001',
      name: 'Common Fixture',
      email: 'common@example.test',
      photoUrl: null,
      createdAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:00:00.000Z',
    };

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('fails when the session guard did not load a person first', () => {
    expect(() => guard.canActivate(context)).toThrow(
      'AdminAuthorizationGuard requires SessionAuthGuard to run first.',
    );
  });
});
