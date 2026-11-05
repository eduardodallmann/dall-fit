import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type {
  CreateTermsRequest,
  PublishTermsRequest,
  TermsFields,
} from '@dall-fit/types';

import { AdminOnly } from '~/auth/decorators/admin-only';
import { AdminMutation } from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type { PersonEntity } from '~/person/domain/person.entity';
import { TermsCommand } from '~/terms/commands/terms.command';
import { termsLog } from '~/terms/domain/terms-log';
import {
  createTermsSchema,
  publishTermsSchema,
  termsFieldsSchema,
  termsIdSchema,
  TermsInputPipe,
  termsPage,
  termsRevision,
} from '~/terms/dto/terms.dto';
import { TermsAdministration } from '~/terms/terms-policy';

@Controller('admin/terms')
@AdminOnly()
@TermsAdministration()
export class AdminTermsController {
  private readonly logger = new Logger(AdminTermsController.name);
  constructor(private readonly command: TermsCommand) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@Query('page') page?: string) {
    termsLog(this.logger, 'AdminTermsController', 'list', 'params');
    const result = await this.command.list(termsPage(page));
    termsLog(this.logger, 'AdminTermsController', 'list', 'command return', {
      completed: true,
    });
    termsLog(this.logger, 'AdminTermsController', 'list', 'return', {
      completed: true,
    });
    return result;
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  async detail(
    @Param('id', new TermsInputPipe(termsIdSchema)) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    termsLog(this.logger, 'AdminTermsController', 'detail', 'params');
    const result = await this.command.detail(id);
    termsLog(this.logger, 'AdminTermsController', 'detail', 'command return', {
      completed: true,
    });
    response.setHeader('X-Resource-Version', String(result.data.version));
    termsLog(this.logger, 'AdminTermsController', 'detail', 'return', {
      completed: true,
    });
    return result;
  }
  @Post()
  @AdminMutation()
  @Header('Cache-Control', 'private, no-store')
  async create(
    @CurrentPerson() person: PersonEntity,
    @Body(new TermsInputPipe(createTermsSchema)) input: CreateTermsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    termsLog(this.logger, 'AdminTermsController', 'create', 'params');
    const result = await this.command.create(person.id, input);
    termsLog(this.logger, 'AdminTermsController', 'create', 'command return', {
      completed: true,
    });
    response.setHeader('X-Resource-Version', String(result.data.version));
    termsLog(this.logger, 'AdminTermsController', 'create', 'return', {
      completed: true,
    });
    return result;
  }
  @Patch(':id')
  @AdminMutation()
  @Header('Cache-Control', 'private, no-store')
  async update(
    @Param('id', new TermsInputPipe(termsIdSchema)) id: string,
    @Headers('x-resource-version') revision: string | undefined,
    @Body(new TermsInputPipe(termsFieldsSchema)) input: TermsFields,
    @Res({ passthrough: true }) response: Response,
  ) {
    termsLog(this.logger, 'AdminTermsController', 'update', 'params');
    const result = await this.command.update(
      id,
      termsRevision(revision),
      input,
    );
    termsLog(this.logger, 'AdminTermsController', 'update', 'command return', {
      completed: true,
    });
    response.setHeader('X-Resource-Version', String(result.data.version));
    termsLog(this.logger, 'AdminTermsController', 'update', 'return', {
      completed: true,
    });
    return result;
  }
  @Post(':id/preview')
  @AdminMutation()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async preview(
    @Param('id', new TermsInputPipe(termsIdSchema)) id: string,
    @Headers('x-resource-version') revision: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    termsLog(this.logger, 'AdminTermsController', 'preview', 'params');
    const result = await this.command.preview(id, termsRevision(revision));
    termsLog(this.logger, 'AdminTermsController', 'preview', 'command return', {
      completed: true,
    });
    response.setHeader('X-Resource-Version', String(result.data.version));
    termsLog(this.logger, 'AdminTermsController', 'preview', 'return', {
      completed: true,
    });
    return result;
  }
  @Post(':id/publish')
  @AdminMutation()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async publish(
    @Param('id', new TermsInputPipe(termsIdSchema)) id: string,
    @Headers('x-resource-version') revision: string | undefined,
    @CurrentPerson() person: PersonEntity,
    @Body(new TermsInputPipe(publishTermsSchema)) input: PublishTermsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    termsLog(this.logger, 'AdminTermsController', 'publish', 'params');
    const result = await this.command.publish(
      id,
      termsRevision(revision),
      person.id,
      input,
    );
    termsLog(this.logger, 'AdminTermsController', 'publish', 'command return', {
      completed: true,
    });
    response.setHeader('X-Resource-Version', String(result.data.version));
    termsLog(this.logger, 'AdminTermsController', 'publish', 'return', {
      completed: true,
    });
    return result;
  }
  @Delete(':id')
  @AdminMutation()
  @HttpCode(204)
  async remove(
    @Param('id', new TermsInputPipe(termsIdSchema)) id: string,
    @Headers('x-resource-version') revision: string | undefined,
  ): Promise<void> {
    termsLog(this.logger, 'AdminTermsController', 'remove', 'params');
    await this.command.remove(id, termsRevision(revision));
    termsLog(this.logger, 'AdminTermsController', 'remove', 'completed');
  }
}
