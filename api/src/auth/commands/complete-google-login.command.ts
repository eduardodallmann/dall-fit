import { timingSafeEqual } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CompleteLoginResult } from '~/auth/domain/auth.types';
import type { GoogleCallbackQueryDto } from '~/auth/dto/google-callback-query.dto';
import { OAuthCallbackError } from '~/auth/errors/oauth-callback.error';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { GoogleOAuthService } from '~/auth/services/google-oauth.service';
import { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';

export interface CompleteGoogleLoginInput {
  callback: GoogleCallbackQueryDto;
  codeVerifierCookie?: string;
  nonceCookie?: string;
  stateCookie?: string;
}

@Injectable()
export class CompleteGoogleLoginCommand {
  private readonly logger = new Logger(CompleteGoogleLoginCommand.name);
  private readonly successUrl: string;
  private readonly failureUrl: string;

  constructor(
    configService: ConfigService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly findOrCreatePersonService: FindOrCreatePersonService,
    private readonly authSessionService: AuthSessionService,
  ) {
    const uiUrl = configService.getOrThrow<string>('UI_URL');
    this.successUrl = new URL('/dash', uiUrl).toString();
    this.failureUrl = new URL('/?authError=oauth_failed', uiUrl).toString();
  }

  async execute(input: CompleteGoogleLoginInput): Promise<CompleteLoginResult> {
    this.logger.log('CompleteGoogleLoginCommand -> execute -> params:', {
      params: {
        authorizationCodePresent: typeof input.callback.code === 'string',
        callbackErrorPresent: typeof input.callback.error === 'string',
        codeVerifierCookiePresent: typeof input.codeVerifierCookie === 'string',
        nonceCookiePresent: typeof input.nonceCookie === 'string',
        stateCookiePresent: typeof input.stateCookie === 'string',
        stateQueryPresent: typeof input.callback.state === 'string',
      },
    });

    try {
      this.validateCallback(input);
      this.logger.log(
        'CompleteGoogleLoginCommand -> execute -> stateValidated completed:',
        { data: { valid: true } },
      );

      const identity = await this.googleOAuthService.exchangeCode(
        input.callback.code!,
        input.nonceCookie!,
        input.codeVerifierCookie!,
      );
      this.logger.log(
        'CompleteGoogleLoginCommand -> execute -> googleOAuthService return:',
        { data: { fields: Object.keys(identity) } },
      );

      const personResult =
        await this.findOrCreatePersonService.execute(identity);
      this.logger.log(
        'CompleteGoogleLoginCommand -> execute -> findOrCreatePersonService return:',
        {
          data: {
            created: personResult.created,
            personId: personResult.person.id,
          },
        },
      );

      this.logPersonBranch(personResult.created, personResult.person.id);

      const session = await this.authSessionService.createSession(
        personResult.person.id,
        'web',
      );
      this.logger.log(
        'CompleteGoogleLoginCommand -> execute -> authSessionService return:',
        { data: { maxAgeMs: session.maxAgeMs, tokenCreated: true } },
      );

      const result = {
        redirectUrl: this.successUrl,
        session,
        succeeded: true,
      };
      this.logger.log('CompleteGoogleLoginCommand -> execute -> return:', {
        data: {
          destination: 'authenticated-ui',
          sessionCreated: true,
          succeeded: result.succeeded,
        },
      });

      return result;
    } catch (error: unknown) {
      if (!(error instanceof OAuthCallbackError)) {
        throw error;
      }

      this.logger.warn(
        'CompleteGoogleLoginCommand -> execute -> oauthFailure branch:',
        {
          data: {
            code: 'OAUTH_CALLBACK_INVALID',
          },
        },
      );

      const result = {
        redirectUrl: this.failureUrl,
        session: null,
        succeeded: false,
      };
      this.logger.log('CompleteGoogleLoginCommand -> execute -> return:', {
        data: {
          destination: 'public-ui',
          sessionCreated: false,
          succeeded: result.succeeded,
        },
      });

      return result;
    }
  }

  private validateCallback(input: CompleteGoogleLoginInput): void {
    this.logger.log(
      'CompleteGoogleLoginCommand -> validateCallback -> params:',
      {
        params: {
          authorizationCodePresent: typeof input.callback.code === 'string',
          callbackErrorPresent: typeof input.callback.error === 'string',
          codeVerifierCookiePresent:
            typeof input.codeVerifierCookie === 'string',
          nonceCookiePresent: typeof input.nonceCookie === 'string',
          stateCookiePresent: typeof input.stateCookie === 'string',
          stateQueryPresent: typeof input.callback.state === 'string',
        },
      },
    );

    if (typeof input.callback.error === 'string') {
      if (input.callback.error === 'access_denied') {
        this.logger.warn(
          'CompleteGoogleLoginCommand -> validateCallback -> accessDenied branch:',
          { data: { code: 'OAUTH_ACCESS_DENIED' } },
        );
        throw new OAuthCallbackError('OAuth access was denied.');
      }

      throw new Error('OAuth provider returned an unexpected callback error.');
    }

    if (
      typeof input.callback.code !== 'string' ||
      typeof input.callback.state !== 'string' ||
      typeof input.stateCookie !== 'string' ||
      typeof input.nonceCookie !== 'string' ||
      typeof input.codeVerifierCookie !== 'string' ||
      !this.valuesMatch(input.callback.state, input.stateCookie)
    ) {
      this.logger.warn(
        'CompleteGoogleLoginCommand -> validateCallback -> invalidCallback error:',
        { data: { code: 'OAUTH_CALLBACK_INVALID' } },
      );
      throw new OAuthCallbackError('OAuth callback is invalid.');
    }

    this.logger.log(
      'CompleteGoogleLoginCommand -> validateCallback -> completed:',
      { data: { valid: true } },
    );
  }

  private valuesMatch(first: string, second: string): boolean {
    this.logger.log('CompleteGoogleLoginCommand -> valuesMatch -> params:', {
      params: {
        firstPresent: first.length > 0,
        secondPresent: second.length > 0,
      },
    });

    const firstBuffer = Buffer.from(first);
    const secondBuffer = Buffer.from(second);
    const result =
      firstBuffer.length === secondBuffer.length &&
      timingSafeEqual(firstBuffer, secondBuffer);

    this.logger.log('CompleteGoogleLoginCommand -> valuesMatch -> return:', {
      data: { matches: result },
    });

    return result;
  }

  private logPersonBranch(created: boolean, personId: string): void {
    this.logger.log(
      'CompleteGoogleLoginCommand -> logPersonBranch -> params:',
      {
        params: { created, personId },
      },
    );

    const message = created
      ? 'CompleteGoogleLoginCommand -> execute -> newPerson branch:'
      : 'CompleteGoogleLoginCommand -> execute -> existingPerson branch:';
    this.logger.log(message, { data: { personId } });
    this.logger.log(
      'CompleteGoogleLoginCommand -> logPersonBranch -> completed:',
      { data: { created, personId } },
    );
  }
}
