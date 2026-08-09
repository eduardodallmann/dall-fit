import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { CompleteGoogleLoginCommand } from '~/auth/commands/complete-google-login.command';
import { GetCurrentPersonCommand } from '~/auth/commands/get-current-person.command';
import { StartGoogleLoginCommand } from '~/auth/commands/start-google-login.command';
import { TestLoginCommand } from '~/auth/commands/test-login.command';
import { UpdateCurrentPersonConfigsCommand } from '~/auth/commands/update-current-person-configs.command';
import { AuthController } from '~/auth/controllers/auth.controller';
import { AdminAuthorizationGuard } from '~/auth/guards/admin-authorization.guard';
import { SessionAuthGuard } from '~/auth/guards/session-auth.guard';
import { TestAuthBypassGuard } from '~/auth/guards/test-auth-bypass.guard';
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
    CompleteGoogleLoginCommand,
    GetCurrentPersonCommand,
    GoogleOAuthService,
    SessionAuthGuard,
    StartGoogleLoginCommand,
    TestAuthBypassGuard,
    TestLoginCommand,
    UpdateCurrentPersonConfigsCommand,
  ],
  exports: [
    AdminAuthorizationGuard,
    AuthSessionService,
    PersonModule,
    SessionAuthGuard,
  ],
})
export class AuthModule {}
