import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

import type { ExternalIdentity } from '~/auth/domain/auth.types';
import { OAuthCallbackError } from '~/auth/errors/oauth-callback.error';
import type { GoogleOAuthCredentials } from '~/config/environment';

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(configService: ConfigService) {
    const credentials = configService.getOrThrow<GoogleOAuthCredentials>(
      'GOOGLE_OAUTH_CREDENTIALS',
    );

    this.clientId = credentials.clientId;
    this.client = new OAuth2Client({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: credentials.redirectUri,
    });
  }

  createAuthorizationUrl(state: string, nonce: string): string {
    this.logger.log('GoogleOAuthService -> createAuthorizationUrl -> params:', {
      params: {
        noncePresent: nonce.length > 0,
        statePresent: state.length > 0,
      },
    });

    const authorizationUrl = this.client.generateAuthUrl({
      access_type: 'online',
      include_granted_scopes: true,
      nonce,
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
      state,
    });

    this.logger.log(
      'GoogleOAuthService -> createAuthorizationUrl -> authorizationUrl prepared:',
      { data: { destination: 'google', protocol: 'https' } },
    );

    const result = authorizationUrl;
    this.logger.log('GoogleOAuthService -> createAuthorizationUrl -> return:', {
      data: { destination: 'google' },
    });

    return result;
  }

  async exchangeCode(code: string, nonce: string): Promise<ExternalIdentity> {
    this.logger.log('GoogleOAuthService -> exchangeCode -> params:', {
      params: {
        authorizationCodePresent: code.length > 0,
        noncePresent: nonce.length > 0,
      },
    });

    const tokenResponse = await this.client.getToken(code);
    this.logger.log(
      'GoogleOAuthService -> exchangeCode -> oauthClient return:',
      {
        data: {
          idTokenPresent: typeof tokenResponse.tokens.id_token === 'string',
          tokenTypePresent: typeof tokenResponse.tokens.token_type === 'string',
        },
      },
    );

    const idToken = tokenResponse.tokens.id_token;
    if (typeof idToken !== 'string') {
      this.logger.warn(
        'GoogleOAuthService -> exchangeCode -> missingIdToken error:',
        { data: { code: 'GOOGLE_ID_TOKEN_MISSING' } },
      );
      throw new OAuthCallbackError('Google did not return an ID token.');
    }

    const ticket = await this.client.verifyIdToken({
      audience: this.clientId,
      idToken,
    });
    const payload = ticket.getPayload();

    this.logger.log(
      'GoogleOAuthService -> exchangeCode -> idTokenValidated completed:',
      {
        data: {
          claimNames: payload === undefined ? [] : Object.keys(payload),
        },
      },
    );

    if (
      payload === undefined ||
      payload.nonce !== nonce ||
      payload.email_verified !== true ||
      typeof payload.sub !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      this.logger.warn(
        'GoogleOAuthService -> exchangeCode -> invalidClaims error:',
        { data: { code: 'GOOGLE_IDENTITY_INVALID' } },
      );
      throw new OAuthCallbackError('Google identity claims are invalid.');
    }

    const result = {
      googleSubject: payload.sub,
      name: payload.name,
      email: payload.email,
      photoUrl: typeof payload.picture === 'string' ? payload.picture : null,
    };

    this.logger.log('GoogleOAuthService -> exchangeCode -> return:', {
      data: { fields: Object.keys(result) },
    });

    return result;
  }
}
