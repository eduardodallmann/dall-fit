import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateNativeSessionResponse, Person } from '@dall-fit/types';

import {
  NativeSessionCoordinator,
  NativeSignInCancelledError,
  type NativeCredentialPort,
  type NativeGoogleSignInPort,
  type NativeLocalDataPort,
  type NativeSessionApiPort,
  type NativeSessionEnvelope,
} from '~/auth/native-session';
import { resetSessionLifecycleForTests } from '~/auth/session-lifecycle';

const personA = { id: 'person-a' } as Person;
const personB = { id: 'person-b' } as Person;

function response(person: Person, token: string): CreateNativeSessionResponse {
  return {
    data: {
      accessToken: token,
      expiresAt: '2099-01-01T00:00:00.000Z',
      person,
      tokenType: 'Bearer',
    },
  };
}

function createHarness(options: {
  envelope?: NativeSessionEnvelope;
  personId?: string;
  nextPerson?: Person;
}) {
  let envelope = options.envelope;
  let personId = options.personId;
  const order: string[] = [];
  const clearAccount = vi.fn(() => {
    order.push('clear-account');
    envelope = undefined;
    personId = undefined;
    return Promise.resolve();
  });
  const clearEnvelope = vi.fn(() => {
    envelope = undefined;
    return Promise.resolve();
  });
  const writeAccountPersonId = vi.fn((value: string) => {
    order.push('write-person');
    personId = value;
    return Promise.resolve();
  });
  const writeEnvelope = vi.fn((value: NativeSessionEnvelope) => {
    order.push('write-envelope');
    envelope = value;
    return Promise.resolve();
  });
  const getInstallationId = vi.fn(() =>
    Promise.resolve('11111111-2222-4333-8444-555555555555'),
  );
  const credentials: NativeCredentialPort = {
    clearAccount,
    clearEnvelope,
    getAccountPersonId: vi.fn(() => Promise.resolve(personId)),
    getInstallationId,
    readEnvelope: vi.fn(() => Promise.resolve(envelope)),
    writeAccountPersonId,
    writeEnvelope,
  };
  const signIn = vi.fn(() =>
    Promise.resolve({ idToken: 'temporary-google-token' }),
  );
  const signOut = vi.fn(() => Promise.resolve());
  const google: NativeGoogleSignInPort = {
    signIn,
    signOut,
  };
  const clearAccountDataAtomically = vi.fn(() => {
    order.push('clear-data');
    return Promise.resolve();
  });
  const localData: NativeLocalDataPort = {
    clearAccountDataAtomically,
    hasPendingChanges: vi.fn(() => Promise.resolve(true)),
  };
  const createSession = vi.fn(() =>
    Promise.resolve(
      response(options.nextPerson ?? personA, 'new-access-token'),
    ),
  );
  const revokeSession = vi.fn(() => Promise.resolve());
  const api: NativeSessionApiPort = {
    createSession,
    revokeSession,
  };
  const coordinator = new NativeSessionCoordinator(
    google,
    credentials,
    localData,
    api,
  );
  return {
    api: { createSession, revokeSession },
    coordinator,
    credentials: {
      clearAccount,
      clearEnvelope,
      getInstallationId,
      writeEnvelope,
    },
    google: { signIn, signOut },
    localData: { clearAccountDataAtomically },
    order,
  };
}

describe('NativeSessionCoordinator', () => {
  beforeEach(() => resetSessionLifecycleForTests());

  it('preserves local data when the canonical API person matches the binding', async () => {
    const harness = createHarness({
      personId: personA.id,
      nextPerson: personA,
    });

    await expect(harness.coordinator.login()).resolves.toMatchObject({
      person: personA,
      status: 'authenticated',
    });
    expect(harness.localData.clearAccountDataAtomically).not.toHaveBeenCalled();
    expect(harness.api.createSession).toHaveBeenCalledWith(
      'temporary-google-token',
    );
  });

  it('cleans the previous account before publishing a different one', async () => {
    const harness = createHarness({
      personId: personA.id,
      nextPerson: personB,
    });

    await harness.coordinator.login();

    expect(harness.order).toEqual([
      'clear-data',
      'clear-account',
      'write-envelope',
      'write-person',
    ]);
  });

  it('blocks account switching and revokes the new token when cleanup fails', async () => {
    const harness = createHarness({
      personId: personA.id,
      nextPerson: personB,
    });
    harness.localData.clearAccountDataAtomically.mockRejectedValueOnce(
      new Error('cleanup failed'),
    );

    await expect(harness.coordinator.login()).rejects.toThrow('cleanup failed');
    expect(harness.credentials.writeEnvelope).not.toHaveBeenCalled();
    expect(harness.api.revokeSession).toHaveBeenCalledWith('new-access-token');
  });

  it('treats Google cancellation as a non-error result', async () => {
    const harness = createHarness({});
    harness.google.signIn.mockRejectedValueOnce(
      new NativeSignInCancelledError(),
    );

    await expect(harness.coordinator.login()).resolves.toEqual({
      status: 'cancelled',
    });
    expect(harness.api.createSession).not.toHaveBeenCalled();
  });

  it('removes only the expired envelope while preserving the account binding', async () => {
    const expired: NativeSessionEnvelope = {
      accessToken: 'expired-token',
      expiresAt: '2020-01-01T00:00:00.000Z',
      personId: personA.id,
      version: 1,
    };
    const harness = createHarness({ envelope: expired, personId: personA.id });

    await harness.coordinator.initialize();

    expect(harness.credentials.clearEnvelope).toHaveBeenCalledOnce();
    expect(harness.credentials.clearAccount).not.toHaveBeenCalled();
  });

  it('clears local state before best-effort remote logout and preserves installation data', async () => {
    const active: NativeSessionEnvelope = {
      accessToken: 'active-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
      personId: personA.id,
      version: 1,
    };
    const harness = createHarness({ envelope: active, personId: personA.id });
    harness.api.revokeSession.mockRejectedValueOnce(new Error('offline'));
    harness.google.signOut.mockRejectedValueOnce(new Error('provider failed'));
    await harness.coordinator.initialize();

    await expect(harness.coordinator.logout()).resolves.toBeUndefined();
    expect(harness.localData.clearAccountDataAtomically).toHaveBeenCalledOnce();
    expect(harness.credentials.clearAccount).toHaveBeenCalledOnce();
    expect(harness.credentials.getInstallationId).toHaveBeenCalledOnce();
  });
});
