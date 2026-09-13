import { Injectable, Logger } from '@nestjs/common';

import type { SessionCookieResult } from '~/auth/domain/auth.types';
import type { TestLoginDto } from '~/auth/dto/test-login.dto';
import { AuthSessionService } from '~/auth/services/auth-session.service';
import { FindOrCreatePersonService } from '~/person/services/find-or-create-person.service';

@Injectable()
export class TestLoginCommand {
  private readonly logger = new Logger(TestLoginCommand.name);

  constructor(
    private readonly findOrCreatePersonService: FindOrCreatePersonService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async execute(identity: TestLoginDto): Promise<SessionCookieResult> {
    this.logger.log('TestLoginCommand -> execute -> params:', {
      params: { fields: Object.keys(identity) },
    });

    const personResult = await this.findOrCreatePersonService.execute(identity);
    this.logger.log(
      'TestLoginCommand -> execute -> findOrCreatePersonService return:',
      {
        data: {
          created: personResult.created,
          personId: personResult.person.id,
        },
      },
    );

    const branch = personResult.created ? 'newPerson' : 'existingPerson';
    this.logger.log(`TestLoginCommand -> execute -> ${branch} branch:`, {
      data: { personId: personResult.person.id },
    });

    const session = await this.authSessionService.createSession(
      personResult.person.id,
      'web',
    );
    this.logger.log(
      'TestLoginCommand -> execute -> authSessionService return:',
      { data: { maxAgeMs: session.maxAgeMs, tokenCreated: true } },
    );

    const result = session;
    this.logger.log('TestLoginCommand -> execute -> return:', {
      data: { maxAgeMs: result.maxAgeMs, tokenCreated: true },
    });

    return result;
  }
}
