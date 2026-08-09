import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StartGoogleLoginCommand } from '~/auth/commands/start-google-login.command';
import type { GoogleOAuthService } from '~/auth/services/google-oauth.service';

describe('StartGoogleLoginCommand', () => {
  const googleOAuthService = { createAuthorizationUrl: vi.fn() };
  let command: StartGoogleLoginCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    googleOAuthService.createAuthorizationUrl.mockReturnValue(
      'https://accounts.google.com/example',
    );
    command = new StartGoogleLoginCommand(
      googleOAuthService as unknown as GoogleOAuthService,
    );
  });

  it('creates independent state and nonce values for the authorization URL', () => {
    const result = command.execute();

    expect(result.authorizationUrl).toBe('https://accounts.google.com/example');
    expect(result.state).not.toBe(result.nonce);
    expect(result.state.length).toBeGreaterThan(20);
    expect(result.nonce.length).toBeGreaterThan(20);
    expect(result.codeVerifier.length).toBeGreaterThan(43);
    expect(googleOAuthService.createAuthorizationUrl).toHaveBeenCalledWith(
      result.state,
      result.nonce,
      expect.any(String),
    );
  });
});
