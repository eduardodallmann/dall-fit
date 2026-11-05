import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Logger,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type {
  CreateNativeSessionResponse,
  CsrfTokenResponse,
  CurrentPersonResponse,
  UpdateCurrentPersonConfigsResponse,
} from '@dall-fit/types';

import {
  createClearSessionCookieOptions,
  createOAuthCookieOptions,
  createSessionCookieOptions,
} from '~/auth/auth-cookie-options';
import {
  AUTH_LEGACY_SESSION_COOKIES,
  getAuthSessionCookieName,
  OAUTH_CODE_VERIFIER_COOKIE,
  OAUTH_COOKIE_MAX_AGE_MS,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '~/auth/auth.constants';
import { CompleteGoogleLoginCommand } from '~/auth/commands/complete-google-login.command';
import { CreateNativeSessionCommand } from '~/auth/commands/create-native-session.command';
import { GetCurrentPersonCommand } from '~/auth/commands/get-current-person.command';
import { LogoutCommand } from '~/auth/commands/logout.command';
import { StartGoogleLoginCommand } from '~/auth/commands/start-google-login.command';
import { TestLoginCommand } from '~/auth/commands/test-login.command';
import { UpdateCurrentPersonConfigsCommand } from '~/auth/commands/update-current-person-configs.command';
import { Authenticated } from '~/auth/decorators/authenticated';
import { AuthenticatedMutation } from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import { RateLimited } from '~/auth/decorators/rate-limited';
import type { AuthenticatedRequest } from '~/auth/domain/auth.types';
import { CreateNativeSessionDto } from '~/auth/dto/create-native-session.dto';
import { GoogleCallbackQueryDto } from '~/auth/dto/google-callback-query.dto';
import { TestLoginDto } from '~/auth/dto/test-login.dto';
import { UpdateCurrentPersonConfigsDto } from '~/auth/dto/update-current-person-configs.dto';
import { LogoutCsrfGuard } from '~/auth/guards/logout-csrf.guard';
import { OptionalNativeSessionGuard } from '~/auth/guards/optional-native-session.guard';
import { OptionalSessionGuard } from '~/auth/guards/optional-session.guard';
import { RateLimitGuard } from '~/auth/guards/rate-limit.guard';
import { TestAuthBypassGuard } from '~/auth/guards/test-auth-bypass.guard';
import type { PersonEntity } from '~/person/domain/person.entity';
import { TermsExempt } from '~/terms/terms-policy';

@Controller()
@TermsExempt()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly secureCookies: boolean;
  private readonly sessionCookieName: string;

  constructor(
    configService: ConfigService,
    private readonly startGoogleLoginCommand: StartGoogleLoginCommand,
    private readonly completeGoogleLoginCommand: CompleteGoogleLoginCommand,
    private readonly createNativeSessionCommand: CreateNativeSessionCommand,
    private readonly logoutCommand: LogoutCommand,
    private readonly testLoginCommand: TestLoginCommand,
    private readonly getCurrentPersonCommand: GetCurrentPersonCommand,
    private readonly updateCurrentPersonConfigsCommand: UpdateCurrentPersonConfigsCommand,
  ) {
    this.secureCookies =
      configService.getOrThrow<boolean>('AUTH_COOKIE_SECURE');
    this.sessionCookieName = getAuthSessionCookieName(this.secureCookies);
  }

  @Get('auth/google')
  @RateLimited({
    bucket: 'google-start',
    limitConfigKey: 'RATE_LIMIT_GOOGLE_START_LIMIT',
    subject: 'ip',
    windowConfigKey: 'RATE_LIMIT_GOOGLE_START_WINDOW_MS',
  })
  @UseGuards(RateLimitGuard)
  startGoogleLogin(@Res() response: Response): void {
    this.logger.log('AuthController -> startGoogleLogin -> params:', {
      params: {},
    });
    const commandResult = this.startGoogleLoginCommand.execute();
    this.logger.log(
      'AuthController -> startGoogleLogin -> startGoogleLoginCommand return:',
      { data: { authorizationUrlCreated: true, pkceCreated: true } },
    );
    const options = createOAuthCookieOptions(
      this.secureCookies,
      OAUTH_COOKIE_MAX_AGE_MS,
    );
    response.cookie(OAUTH_STATE_COOKIE, commandResult.state, options);
    response.cookie(OAUTH_NONCE_COOKIE, commandResult.nonce, options);
    response.cookie(
      OAUTH_CODE_VERIFIER_COOKIE,
      commandResult.codeVerifier,
      options,
    );
    response.redirect(commandResult.authorizationUrl);
    this.logger.log('AuthController -> startGoogleLogin -> completed:', {
      data: { destination: 'google', status: 302 },
    });
  }

  @Get('callback')
  @RateLimited({
    bucket: 'google-callback',
    limitConfigKey: 'RATE_LIMIT_GOOGLE_CALLBACK_LIMIT',
    subject: 'ip',
    windowConfigKey: 'RATE_LIMIT_GOOGLE_CALLBACK_WINDOW_MS',
  })
  @UseGuards(RateLimitGuard)
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
        codeVerifierCookiePresent:
          typeof cookies?.[OAUTH_CODE_VERIFIER_COOKIE] === 'string',
        nonceCookiePresent: typeof cookies?.[OAUTH_NONCE_COOKIE] === 'string',
        stateCookiePresent: typeof cookies?.[OAUTH_STATE_COOKIE] === 'string',
      },
    });
    const commandResult = await this.completeGoogleLoginCommand.execute({
      callback,
      codeVerifierCookie: cookies?.[OAUTH_CODE_VERIFIER_COOKIE],
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

    if (commandResult.session !== null) {
      response.cookie(
        this.sessionCookieName,
        commandResult.session.token,
        createSessionCookieOptions(
          this.secureCookies,
          commandResult.session.maxAgeMs,
        ),
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
  @RateLimited({
    bucket: 'test-login',
    limitConfigKey: 'RATE_LIMIT_TEST_LOGIN_LIMIT',
    subject: 'ip',
    windowConfigKey: 'RATE_LIMIT_TEST_LOGIN_WINDOW_MS',
  })
  @UseGuards(TestAuthBypassGuard, RateLimitGuard)
  async testLogin(
    @Body() identity: TestLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.logger.log('AuthController -> testLogin -> params:', {
      params: { fields: Object.keys(identity) },
    });
    const commandResult = await this.testLoginCommand.execute(identity);
    response.cookie(
      this.sessionCookieName,
      commandResult.token,
      createSessionCookieOptions(this.secureCookies, commandResult.maxAgeMs),
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
    const result = commandResult;
    this.logger.log('AuthController -> getCurrentPerson -> return:', {
      data: { fields: Object.keys(result.data), personId: result.data.id },
    });
    return result;
  }

  @Post('auth/native/session')
  @Header('Cache-Control', 'no-store')
  @RateLimited({
    bucket: 'native-session',
    limitConfigKey: 'RATE_LIMIT_NATIVE_SESSION_LIMIT',
    subject: 'ip',
    windowConfigKey: 'RATE_LIMIT_NATIVE_SESSION_WINDOW_MS',
  })
  @UseGuards(RateLimitGuard)
  async createNativeSession(
    @Body() input: CreateNativeSessionDto,
  ): Promise<CreateNativeSessionResponse> {
    this.logger.log('AuthController -> createNativeSession -> params:', {
      params: {
        fields: Object.keys(input),
        identityTokenPresent: input.identityToken.length > 0,
      },
    });
    const commandResult = await this.createNativeSessionCommand.execute(
      input.identityToken,
    );
    this.logger.log(
      'AuthController -> createNativeSession -> createNativeSessionCommand return:',
      {
        data: {
          expiresAt: commandResult.data.expiresAt,
          personId: commandResult.data.person.id,
          tokenCreated: commandResult.data.accessToken.length > 0,
        },
      },
    );
    const result = commandResult;
    this.logger.log('AuthController -> createNativeSession -> return:', {
      data: {
        expiresAt: result.data.expiresAt,
        personId: result.data.person.id,
        tokenCreated: true,
      },
    });
    return result;
  }

  @Get('auth/csrf')
  @Header('Cache-Control', 'no-store')
  @RateLimited({
    bucket: 'csrf',
    limitConfigKey: 'RATE_LIMIT_SESSION_LIMIT',
    subject: 'session-ip',
    windowConfigKey: 'RATE_LIMIT_SESSION_WINDOW_MS',
  })
  @UseGuards(RateLimitGuard)
  @Authenticated()
  getCsrfToken(@Req() request: AuthenticatedRequest): CsrfTokenResponse {
    this.logger.log('AuthController -> getCsrfToken -> params:', {
      params: { sessionLoaded: request.currentSession !== undefined },
    });
    if (request.currentSession === undefined) {
      throw new Error('Authenticated request did not include its session.');
    }
    if (request.currentSession.channel !== 'web') {
      this.logger.warn(
        'AuthController -> getCsrfToken -> nativeSession error:',
        { data: { code: 'CSRF_NOT_AVAILABLE' } },
      );
      throw new ForbiddenException({
        code: 'CSRF_NOT_AVAILABLE',
        details: {},
        message: 'CSRF tokens are available only for web sessions.',
      });
    }
    const result = { data: { token: request.currentSession.csrfToken } };
    this.logger.log('AuthController -> getCsrfToken -> return:', {
      data: { tokenReturned: true },
    });
    return result;
  }

  @Post('auth/logout')
  @HttpCode(204)
  @RateLimited({
    bucket: 'logout',
    limitConfigKey: 'RATE_LIMIT_SESSION_LIMIT',
    subject: 'optional-session-ip',
    windowConfigKey: 'RATE_LIMIT_SESSION_WINDOW_MS',
  })
  @UseGuards(OptionalSessionGuard, RateLimitGuard, LogoutCsrfGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.logger.log('AuthController -> logout -> params:', {
      params: { activeSession: request.currentSession !== undefined },
    });
    await this.logoutCommand.execute(request.currentSession);
    this.clearSessionCookies(response);
    this.logger.log('AuthController -> logout -> completed:', {
      data: { status: 204 },
    });
  }

  @Delete('auth/native/session')
  @HttpCode(204)
  @RateLimited({
    bucket: 'native-logout',
    limitConfigKey: 'RATE_LIMIT_SESSION_LIMIT',
    subject: 'optional-session-ip',
    windowConfigKey: 'RATE_LIMIT_SESSION_WINDOW_MS',
  })
  @UseGuards(OptionalNativeSessionGuard, RateLimitGuard)
  async logoutNative(@Req() request: AuthenticatedRequest): Promise<void> {
    this.logger.log('AuthController -> logoutNative -> params:', {
      params: { activeSession: request.currentSession !== undefined },
    });
    await this.logoutCommand.execute(request.currentSession);
    this.logger.log('AuthController -> logoutNative -> completed:', {
      data: { status: 204 },
    });
  }

  @Patch('auth/me/configs')
  @AuthenticatedMutation()
  async updateCurrentPersonConfigs(
    @CurrentPerson() person: PersonEntity,
    @Body() configs: UpdateCurrentPersonConfigsDto,
  ): Promise<UpdateCurrentPersonConfigsResponse> {
    this.logger.log('AuthController -> updateCurrentPersonConfigs -> params:', {
      params: { fields: Object.keys(configs), personId: person.id },
    });
    const commandResult = await this.updateCurrentPersonConfigsCommand.execute(
      person,
      configs,
    );
    const result = commandResult;
    this.logger.log('AuthController -> updateCurrentPersonConfigs -> return:', {
      data: { fields: Object.keys(result.data), personId: result.data.id },
    });
    return result;
  }

  private clearSessionCookies(response: Response): void {
    const options = createClearSessionCookieOptions(this.secureCookies);
    for (const cookieName of AUTH_LEGACY_SESSION_COOKIES) {
      response.clearCookie(cookieName, options);
    }
    this.logger.log('AuthController -> clearSessionCookies -> completed:', {
      data: { cookieCount: AUTH_LEGACY_SESSION_COOKIES.length },
    });
  }
}
