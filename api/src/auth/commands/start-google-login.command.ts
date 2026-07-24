import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { GoogleOAuthService } from '~/auth/services/google-oauth.service';

export interface StartGoogleLoginResult {
  authorizationUrl: string;
  nonce: string;
  state: string;
}

@Injectable()
export class StartGoogleLoginCommand {
  private readonly logger = new Logger(StartGoogleLoginCommand.name);

  constructor(private readonly googleOAuthService: GoogleOAuthService) {}

  execute(): StartGoogleLoginResult {
    this.logger.log('StartGoogleLoginCommand -> execute -> params:', {
      params: {},
    });

    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    this.logger.log(
      'StartGoogleLoginCommand -> execute -> oauthValues prepared:',
      { data: { nonceCreated: true, stateCreated: true } },
    );

    const authorizationUrl = this.googleOAuthService.createAuthorizationUrl(
      state,
      nonce,
    );
    this.logger.log(
      'StartGoogleLoginCommand -> execute -> googleOAuthService return:',
      { data: { destination: 'google' } },
    );

    const result = { authorizationUrl, nonce, state };
    this.logger.log('StartGoogleLoginCommand -> execute -> return:', {
      data: {
        authorizationUrlCreated: true,
        nonceCreated: true,
        stateCreated: true,
      },
    });

    return result;
  }
}
