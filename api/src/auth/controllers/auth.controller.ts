import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type {
  CurrentPersonResponse,
  StartGoogleLoginResponse,
} from '@dall-fit/types';

import {
  createAuthCookieOptions,
  createClearCookieOptions,
} from '~/auth/auth-cookie-options';
import {
  AUTH_SESSION_COOKIE,
  OAUTH_COOKIE_MAX_AGE_MS,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '~/auth/auth.constants';
import { CompleteGoogleLoginCommand } from '~/auth/commands/complete-google-login.command';
import { GetCurrentPersonCommand } from '~/auth/commands/get-current-person.command';
import { StartGoogleLoginCommand } from '~/auth/commands/start-google-login.command';
import { TestLoginCommand } from '~/auth/commands/test-login.command';
import { Authenticated } from '~/auth/decorators/authenticated';
import { CurrentPerson } from '~/auth/decorators/current-person';
import { GoogleCallbackQueryDto } from '~/auth/dto/google-callback-query.dto';
import { TestLoginDto } from '~/auth/dto/test-login.dto';
import { TestAuthBypassGuard } from '~/auth/guards/test-auth-bypass.guard';
import type { PersonEntity } from '~/person/domain/person.entity';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly secureCookies: boolean;

  constructor(
    configService: ConfigService,
    private readonly startGoogleLoginCommand: StartGoogleLoginCommand,
    private readonly completeGoogleLoginCommand: CompleteGoogleLoginCommand,
    private readonly testLoginCommand: TestLoginCommand,
    private readonly getCurrentPersonCommand: GetCurrentPersonCommand,
  ) {
    this.secureCookies =
      configService.getOrThrow<boolean>('AUTH_COOKIE_SECURE');
  }

  @Get('auth/google')
  startGoogleLogin(@Res() response: Response): void {
    this.logger.log('AuthController -> startGoogleLogin -> params:', {
      params: {},
    });

    const commandResult = this.startGoogleLoginCommand.execute();
    this.logger.log(
      'AuthController -> startGoogleLogin -> startGoogleLoginCommand return:',
      {
        data: {
          authorizationUrlCreated: true,
          nonceCreated: true,
          stateCreated: true,
        },
      },
    );

    const temporaryCookieOptions = createAuthCookieOptions(
      this.secureCookies,
      OAUTH_COOKIE_MAX_AGE_MS,
    );
    response.cookie(
      OAUTH_STATE_COOKIE,
      commandResult.state,
      temporaryCookieOptions,
    );
    response.cookie(
      OAUTH_NONCE_COOKIE,
      commandResult.nonce,
      temporaryCookieOptions,
    );
    this.logger.log(
      'AuthController -> startGoogleLogin -> oauthCookies completed:',
      { data: { cookieNames: [OAUTH_STATE_COOKIE, OAUTH_NONCE_COOKIE] } },
    );

    response.redirect(commandResult.authorizationUrl);
    this.logger.log('AuthController -> startGoogleLogin -> completed:', {
      data: { destination: 'google', status: 302 },
    });
  }

  @Post('auth/google')
  @HttpCode(200)
  prepareGoogleLogin(
    @Res({ passthrough: true }) response: Response,
  ): StartGoogleLoginResponse {
    this.logger.log('AuthController -> prepareGoogleLogin -> params:', {
      params: {},
    });

    const commandResult = this.startGoogleLoginCommand.execute();
    this.logger.log(
      'AuthController -> prepareGoogleLogin -> startGoogleLoginCommand return:',
      {
        data: {
          authorizationUrlCreated: true,
          nonceCreated: true,
          stateCreated: true,
        },
      },
    );

    const temporaryCookieOptions = createAuthCookieOptions(
      this.secureCookies,
      OAUTH_COOKIE_MAX_AGE_MS,
    );
    response.cookie(
      OAUTH_STATE_COOKIE,
      commandResult.state,
      temporaryCookieOptions,
    );
    response.cookie(
      OAUTH_NONCE_COOKIE,
      commandResult.nonce,
      temporaryCookieOptions,
    );
    this.logger.log(
      'AuthController -> prepareGoogleLogin -> oauthCookies completed:',
      { data: { cookieNames: [OAUTH_STATE_COOKIE, OAUTH_NONCE_COOKIE] } },
    );

    const result = {
      data: { authorizationUrl: commandResult.authorizationUrl },
    };
    this.logger.log('AuthController -> prepareGoogleLogin -> return:', {
      data: { authorizationUrlCreated: true, status: 200 },
    });

    return result;
  }

  @Get('callback')
  async completeGoogleLogin(
    @Query() callback: GoogleCallbackQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const cookies = request.cookies as
      Record<string, string | undefined> | undefined;
    this.logger.log('AuthController -> completeGoogleLogin -> params:', {
      params: {
        authorizationCodePresent: typeof callback.code === 'string',
        callbackErrorPresent: typeof callback.error === 'string',
        nonceCookiePresent: typeof cookies?.[OAUTH_NONCE_COOKIE] === 'string',
        stateCookiePresent: typeof cookies?.[OAUTH_STATE_COOKIE] === 'string',
        stateQueryPresent: typeof callback.state === 'string',
      },
    });

    const commandResult = await this.completeGoogleLoginCommand.execute({
      callback,
      nonceCookie: cookies?.[OAUTH_NONCE_COOKIE],
      stateCookie: cookies?.[OAUTH_STATE_COOKIE],
    });
    this.logger.log(
      'AuthController -> completeGoogleLogin -> completeGoogleLoginCommand return:',
      {
        data: {
          sessionCreated: commandResult.session !== null,
          succeeded: commandResult.succeeded,
        },
      },
    );

    const clearOptions = createClearCookieOptions(this.secureCookies);
    response.clearCookie(OAUTH_STATE_COOKIE, clearOptions);
    response.clearCookie(OAUTH_NONCE_COOKIE, clearOptions);
    this.logger.log(
      'AuthController -> completeGoogleLogin -> oauthCookiesCleared completed:',
      { data: { cookieNames: [OAUTH_STATE_COOKIE, OAUTH_NONCE_COOKIE] } },
    );

    if (commandResult.session !== null) {
      this.logger.log(
        'AuthController -> completeGoogleLogin -> authenticated branch:',
        { data: { sessionCreated: true } },
      );
      response.cookie(
        AUTH_SESSION_COOKIE,
        commandResult.session.token,
        createAuthCookieOptions(
          this.secureCookies,
          commandResult.session.maxAgeMs,
        ),
      );
    } else {
      this.logger.log(
        'AuthController -> completeGoogleLogin -> failed branch:',
        { data: { sessionCreated: false } },
      );
    }

    response.redirect(commandResult.redirectUrl);
    this.logger.log('AuthController -> completeGoogleLogin -> completed:', {
      data: {
        destination: commandResult.succeeded ? 'authenticated-ui' : 'public-ui',
        status: 302,
      },
    });
  }

  @Post('auth/test-login')
  @HttpCode(204)
  @UseGuards(TestAuthBypassGuard)
  async testLogin(
    @Body() identity: TestLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.logger.log('AuthController -> testLogin -> params:', {
      params: { fields: Object.keys(identity) },
    });

    const commandResult = await this.testLoginCommand.execute(identity);
    this.logger.log('AuthController -> testLogin -> testLoginCommand return:', {
      data: { maxAgeMs: commandResult.maxAgeMs, tokenCreated: true },
    });

    response.cookie(
      AUTH_SESSION_COOKIE,
      commandResult.token,
      createAuthCookieOptions(this.secureCookies, commandResult.maxAgeMs),
    );
    this.logger.log('AuthController -> testLogin -> completed:', {
      data: { cookieCreated: true, status: 204 },
    });
  }

  @Get('auth/me')
  @Authenticated()
  getCurrentPerson(
    @CurrentPerson() person: PersonEntity,
  ): CurrentPersonResponse {
    this.logger.log('AuthController -> getCurrentPerson -> params:', {
      params: { personId: person.id },
    });

    const commandResult = this.getCurrentPersonCommand.execute(person);
    this.logger.log(
      'AuthController -> getCurrentPerson -> getCurrentPersonCommand return:',
      {
        data: {
          fields: Object.keys(commandResult.data),
          personId: commandResult.data.id,
        },
      },
    );

    const result = commandResult;
    this.logger.log('AuthController -> getCurrentPerson -> return:', {
      data: {
        fields: Object.keys(result.data),
        personId: result.data.id,
      },
    });

    return result;
  }
}
