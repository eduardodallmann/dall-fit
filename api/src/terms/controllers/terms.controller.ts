import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AcceptTermsRequest } from '@dall-fit/types';

import { Authenticated } from '~/auth/decorators/authenticated';
import { AuthenticatedMutation } from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type {
  AuthenticatedRequest,
  VerifiedSession,
} from '~/auth/domain/auth.types';
import type { PersonEntity } from '~/person/domain/person.entity';
import { TermsCommand } from '~/terms/commands/terms.command';
import { termsLog } from '~/terms/domain/terms-log';
import {
  acceptTermsSchema,
  termsIdSchema,
  TermsInputPipe,
  termsPage,
} from '~/terms/dto/terms.dto';
import { TermsExempt } from '~/terms/terms-policy';

@Controller('terms')
@Authenticated()
@TermsExempt()
export class TermsController {
  private readonly logger = new Logger(TermsController.name);
  constructor(private readonly command: TermsCommand) {}
  @Get('access')
  @Header('Cache-Control', 'private, no-store')
  async access(@CurrentPerson() person: PersonEntity) {
    termsLog(this.logger, 'TermsController', 'access', 'params');
    const result = await this.command.access(person.id);
    termsLog(this.logger, 'TermsController', 'access', 'command return', {
      completed: true,
    });
    termsLog(this.logger, 'TermsController', 'access', 'return', {
      completed: true,
    });
    return result;
  }
  @Get('current')
  @Header('Cache-Control', 'private, no-store')
  async current(@CurrentPerson() person: PersonEntity) {
    termsLog(this.logger, 'TermsController', 'current', 'params');
    const result = await this.command.current(person.id);
    termsLog(this.logger, 'TermsController', 'current', 'command return', {
      completed: true,
    });
    termsLog(this.logger, 'TermsController', 'current', 'return', {
      completed: true,
    });
    return result;
  }
  @Get('acceptances')
  @Header('Cache-Control', 'private, no-store')
  async history(
    @CurrentPerson() person: PersonEntity,
    @Query('page') page?: string,
  ) {
    termsLog(this.logger, 'TermsController', 'history', 'params');
    const result = await this.command.history(person.id, termsPage(page));
    termsLog(this.logger, 'TermsController', 'history', 'command return', {
      completed: true,
    });
    termsLog(this.logger, 'TermsController', 'history', 'return', {
      completed: true,
    });
    return result;
  }
  @Get('versions/:id')
  @Header('Cache-Control', 'private, no-store')
  async published(@Param('id', new TermsInputPipe(termsIdSchema)) id: string) {
    termsLog(this.logger, 'TermsController', 'published', 'params');
    const result = await this.command.published(id);
    termsLog(this.logger, 'TermsController', 'published', 'command return', {
      completed: true,
    });
    termsLog(this.logger, 'TermsController', 'published', 'return', {
      completed: true,
    });
    return result;
  }
  @Post('acceptances')
  @AuthenticatedMutation()
  @Header('Cache-Control', 'private, no-store')
  async accept(
    @Req()
    request: AuthenticatedRequest & {
      currentPerson: PersonEntity;
      currentSession: VerifiedSession;
    },
    @Body(new TermsInputPipe(acceptTermsSchema)) input: AcceptTermsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    termsLog(this.logger, 'TermsController', 'accept', 'params');
    const commandResult = await this.command.accept(
      request.currentPerson.id,
      request.currentSession.channel,
      input,
    );
    termsLog(this.logger, 'TermsController', 'accept', 'command return', {
      status: commandResult.status,
    });
    response.status(commandResult.status);
    const result = commandResult.response;
    termsLog(this.logger, 'TermsController', 'accept', 'return', {
      status: commandResult.status,
    });
    return result;
  }
}
