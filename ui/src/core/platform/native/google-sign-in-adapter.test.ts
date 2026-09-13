import { describe, expect, it, vi } from 'vitest';

import { NativeSignInCancelledError } from '~/auth/native-session';
import { GoogleSignInAdapter } from '~/core/platform/native/google-sign-in-adapter';

describe('GoogleSignInAdapter', () => {
  it('initializes once with the server client id and exposes only idToken', async () => {
    const plugin = {
      initialize: vi.fn(() => Promise.resolve()),
      signIn: vi.fn(() =>
        Promise.resolve({
          displayName: 'Untrusted profile',
          idToken: 'temporary-id-token',
        }),
      ),
      signOut: vi.fn(() => Promise.resolve()),
    };
    const adapter = new GoogleSignInAdapter('server-client-id', plugin);

    await expect(adapter.signIn()).resolves.toEqual({
      idToken: 'temporary-id-token',
    });
    await adapter.signOut();

    expect(plugin.initialize).toHaveBeenCalledOnce();
    expect(plugin.initialize).toHaveBeenCalledWith({
      clientId: 'server-client-id',
    });
  });

  it('classifies explicit provider cancellation', async () => {
    const plugin = {
      initialize: vi.fn(() => Promise.resolve()),
      signIn: vi.fn(() =>
        Promise.reject(
          Object.assign(new Error('cancelled'), {
            code: 'SIGN_IN_CANCELED',
          }),
        ),
      ),
      signOut: vi.fn(() => Promise.resolve()),
    };
    const adapter = new GoogleSignInAdapter('server-client-id', plugin);

    await expect(adapter.signIn()).rejects.toBeInstanceOf(
      NativeSignInCancelledError,
    );
  });
});
