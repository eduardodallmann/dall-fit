import { describe, expect, it, vi } from 'vitest';

import {
  NATIVE_SESSION_ENVELOPE_VERSION,
  type NativeSessionEnvelope,
} from '~/auth/native-session';
import { SecureCredentialAdapter } from '~/core/platform/native/secure-credential-adapter';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    setKeyPrefix: vi.fn(() => Promise.resolve()),
    values,
  };
}

describe('SecureCredentialAdapter', () => {
  it('creates one random installation UUID and preserves it on account clearing', async () => {
    const storage = createStorage();
    const uuid = '11111111-2222-4333-8444-555555555555';
    const adapter = new SecureCredentialAdapter(storage, () => uuid);

    await expect(adapter.getInstallationId()).resolves.toBe(uuid);
    await expect(adapter.getInstallationId()).resolves.toBe(uuid);
    await adapter.clearAccount();

    expect(storage.setKeyPrefix).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.values.get('installation-id')).toBe(uuid);
  });

  it('removes corrupted or unknown session envelopes', async () => {
    const storage = createStorage({ 'session-envelope': '{"version":2}' });
    const adapter = new SecureCredentialAdapter(storage);

    await expect(adapter.readEnvelope()).resolves.toBeUndefined();
    expect(storage.removeItem).toHaveBeenCalledWith('session-envelope');
  });

  it('round-trips only the versioned minimum envelope', async () => {
    const storage = createStorage();
    const adapter = new SecureCredentialAdapter(storage);
    const envelope: NativeSessionEnvelope = {
      accessToken: 'native-access-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
      personId: 'person-a',
      version: NATIVE_SESSION_ENVELOPE_VERSION,
    };

    await adapter.writeEnvelope(envelope);

    await expect(adapter.readEnvelope()).resolves.toEqual(envelope);
    expect(storage.values.get('session-envelope')).not.toContain('email');
  });
});
