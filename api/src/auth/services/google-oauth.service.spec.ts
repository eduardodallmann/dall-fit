import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthCallbackError } from '~/auth/errors/oauth-callback.error';
import { GoogleOAuthService } from '~/auth/services/google-oauth.service';

const oauthClient = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  CodeChallengeMethod: { S256: 'S256' },
  OAuth2Client: class OAuth2ClientMock {
    generateAuthUrl = oauthClient.generateAuthUrl;
    getToken = oauthClient.getToken;
    verifyIdToken = oauthClient.verifyIdToken;
  },
}));

describe('GoogleOAuthService', () => {
  const configService = {
    getOrThrow: vi.fn().mockReturnValue({
      clientId: 'fake-client.apps.googleusercontent.com',
      clientSecret: 'fake-secret',
      redirectUri: 'http://localhost:4000/callback',
    }),
  };
  let service: GoogleOAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleOAuthService(configService as unknown as ConfigService);
  });

  it('uses only identity scopes with state and nonce', () => {
    oauthClient.generateAuthUrl.mockReturnValue(
      'https://accounts.google.com/authorize',
    );

    const result = service.createAuthorizationUrl(
      'state-value',
      'nonce-value',
      'challenge-value',
    );

    expect(result).toBe('https://accounts.google.com/authorize');
    expect(oauthClient.generateAuthUrl).toHaveBeenCalledWith({
      access_type: 'online',
      code_challenge: 'challenge-value',
      code_challenge_method: 'S256',
      include_granted_scopes: true,
      nonce: 'nonce-value',
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
      state: 'state-value',
    });
  });

  it('maps a verified ID token to the internal external identity', async () => {
    oauthClient.getToken.mockResolvedValue({
      tokens: { id_token: 'signed-google-token', token_type: 'Bearer' },
    });
    oauthClient.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        sub: 'google-subject-001',
        name: 'Alex Runner',
        email: 'alex.runner@example.test',
        email_verified: true,
        nonce: 'nonce-value',
        picture: 'https://example.test/alex.png',
      }),
    });

    const result = await service.exchangeCode(
      'one-time-code',
      'nonce-value',
      'code-verifier',
    );

    expect(result).toEqual({
      googleSubject: 'google-subject-001',
      name: 'Alex Runner',
      email: 'alex.runner@example.test',
      photoUrl: 'https://example.test/alex.png',
    });
    expect(oauthClient.verifyIdToken).toHaveBeenCalledWith({
      audience: 'fake-client.apps.googleusercontent.com',
      idToken: 'signed-google-token',
    });
    expect(oauthClient.getToken).toHaveBeenCalledWith({
      code: 'one-time-code',
      codeVerifier: 'code-verifier',
    });
  });

  it('rejects a response without an ID token', async () => {
    oauthClient.getToken.mockResolvedValue({ tokens: {} });

    await expect(
      service.exchangeCode('one-time-code', 'nonce-value', 'code-verifier'),
    ).rejects.toBeInstanceOf(OAuthCallbackError);
  });

  it.each([
    {
      iss: 'https://accounts.google.com',
      sub: 'google-subject-001',
      name: 'Alex Runner',
      email: 'alex.runner@example.test',
      email_verified: true,
      nonce: 'different-nonce',
    },
    {
      iss: 'https://accounts.google.com',
      sub: 'google-subject-001',
      name: 'Alex Runner',
      email: 'alex.runner@example.test',
      email_verified: false,
      nonce: 'nonce-value',
    },
    {
      iss: 'https://accounts.google.com',
      sub: 'google-subject-001',
      email: 'alex.runner@example.test',
      email_verified: true,
      nonce: 'nonce-value',
    },
  ])('rejects invalid identity claims', async (payload) => {
    oauthClient.getToken.mockResolvedValue({
      tokens: { id_token: 'signed-google-token' },
    });
    oauthClient.verifyIdToken.mockResolvedValue({
      getPayload: () => payload,
    });

    await expect(
      service.exchangeCode('one-time-code', 'nonce-value', 'code-verifier'),
    ).rejects.toBeInstanceOf(OAuthCallbackError);
  });
});
