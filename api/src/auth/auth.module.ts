import {
  MiddlewareConsumer,
  Module,
  RequestMethod,
  type NestModule,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { CompleteGoogleLoginCommand } from '~/auth/commands/complete-google-login.command';
import { CreateNativeSessionCommand } from '~/auth/commands/create-native-session.command';
import { GetCurrentPersonCommand } from '~/auth/commands/get-current-person.command';
import { LogoutCommand } from '~/auth/commands/logout.command';
import { StartGoogleLoginCommand } from '~/auth/commands/start-google-login.command';
import { TestLoginCommand } from '~/auth/commands/test-login.command';
import { UpdateCurrentPersonConfigsCommand } from '~/auth/commands/update-current-person-configs.command';
import { AuthController } from '~/auth/controllers/auth.controller';
import { AdminAuthorizationGuard } from '~/auth/guards/admin-authorization.guard';
import { CsrfGuard } from '~/auth/guards/csrf.guard';
import { LogoutCsrfGuard } from '~/auth/guards/logout-csrf.guard';
import { NativeSessionGuard } from '~/auth/guards/native-session.guard';
import { OptionalNativeSessionGuard } from '~/auth/guards/optional-native-session.guard';
import { OptionalSessionGuard } from '~/auth/guards/optional-session.guard';
import { RateLimitGuard } from '~/auth/guards/rate-limit.guard';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';
import { TestAuthBypassGuard } from '~/auth/guards/test-auth-bypass.guard';
import { OAuthCallbackCookiesMiddleware } from '~/auth/middleware/oauth-callback-cookies.middleware';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { GoogleOAuthService } from '~/auth/services/google-oauth.service';
import { PersonModule } from '~/person/person.module';

@Module({
  imports: [
    PersonModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('AUTH_SESSION_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthSessionService,
    AdminAuthorizationGuard,
    CsrfGuard,
    CompleteGoogleLoginCommand,
    CreateNativeSessionCommand,
    GetCurrentPersonCommand,
    GoogleOAuthService,
    LogoutCommand,
    LogoutCsrfGuard,
    OptionalNativeSessionGuard,
    OptionalSessionGuard,
    OAuthCallbackCookiesMiddleware,
    NativeSessionGuard,
    RateLimitGuard,
    SessionAuthGuard,
    StartGoogleLoginCommand,
    TestAuthBypassGuard,
    TestLoginCommand,
    UpdateCurrentPersonConfigsCommand,
  ],
  exports: [
    AdminAuthorizationGuard,
    AuthSessionService,
    NativeSessionGuard,
    PersonModule,
    SessionAuthGuard,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(OAuthCallbackCookiesMiddleware)
      .forRoutes({ method: RequestMethod.GET, path: 'callback' });
  }
}
