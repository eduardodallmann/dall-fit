import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import type { CreateNativeSessionResponse, Person } from '@dall-fit/types';

import { InvalidGoogleIdentityError } from '~/auth/errors/invalid-google-identity.error';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { GoogleOAuthService } from '~/auth/services/google-oauth.service';
import type { PersonEntity } from '~/person/domain/person.entity';
import { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';

@Injectable()
export class CreateNativeSessionCommand {
  private readonly logger = new Logger(CreateNativeSessionCommand.name);

  constructor(
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly findOrCreatePersonService: FindOrCreatePersonService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async execute(identityToken: string): Promise<CreateNativeSessionResponse> {
    this.logger.log('CreateNativeSessionCommand -> execute -> params:', {
      params: { identityTokenPresent: identityToken.length > 0 },
    });

    let identity;
    try {
      identity =
        await this.googleOAuthService.verifyNativeIdentityToken(identityToken);
    } catch (error: unknown) {
      if (!(error instanceof InvalidGoogleIdentityError)) {
        throw error;
      }
      this.logger.warn(
        'CreateNativeSessionCommand -> execute -> invalidGoogleIdentity error:',
        { data: { code: 'GOOGLE_IDENTITY_INVALID' } },
      );
      throw new UnauthorizedException({
        code: 'GOOGLE_IDENTITY_INVALID',
        details: {},
        message: 'Google identity is invalid.',
      });
    }
    this.logger.log(
      'CreateNativeSessionCommand -> execute -> googleOAuthService return:',
      { data: { fields: Object.keys(identity) } },
    );

    const personResult = await this.findOrCreatePersonService.execute(identity);
    this.logger.log(
      'CreateNativeSessionCommand -> execute -> findOrCreatePersonService return:',
      {
        data: {
          created: personResult.created,
          personId: personResult.person.id,
        },
      },
    );

    const session = await this.authSessionService.createSession(
      personResult.person.id,
      'native',
    );
    this.logger.log(
      'CreateNativeSessionCommand -> execute -> authSessionService return:',
      {
        data: {
          expiresAt: session.expiresAt,
          tokenCreated: session.token.length > 0,
        },
      },
    );

    const result: CreateNativeSessionResponse = {
      data: {
        accessToken: session.token,
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
        person: this.toPublicPerson(personResult.person),
        tokenType: 'Bearer',
      },
    };
    this.logger.log('CreateNativeSessionCommand -> execute -> return:', {
      data: {
        expiresAt: result.data.expiresAt,
        personId: result.data.person.id,
        tokenCreated: true,
        tokenType: result.data.tokenType,
      },
    });
    return result;
  }

  private toPublicPerson(person: PersonEntity): Person {
    this.logger.log('CreateNativeSessionCommand -> toPublicPerson -> params:', {
      params: { personId: person.id },
    });
    const result: Person = {
      configs: person.configs,
      createdAt: person.createdAt,
      email: person.email,
      id: person.id,
      ...(person.isAdmin === true ? { isAdmin: true as const } : {}),
      name: person.name,
      photoUrl: person.photoUrl,
      updatedAt: person.updatedAt,
    };
    this.logger.log('CreateNativeSessionCommand -> toPublicPerson -> return:', {
      data: { fields: Object.keys(result), personId: result.id },
    });
    return result;
  }
}
