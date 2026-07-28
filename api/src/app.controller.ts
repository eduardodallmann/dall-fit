import { Controller, Get, Logger } from '@nestjs/common';

import { Authenticated } from '~/auth/decorators/authenticated';
import { GetRootCommand } from '~/commands/get-root.command';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly getRootCommand: GetRootCommand) {}

  @Get()
  @Authenticated()
  getRoot(): string {
    this.logger.log('AppController -> getRoot -> params:', { params: {} });

    const commandResult = this.getRootCommand.execute();
    this.logger.log('AppController -> getRoot -> getRootCommand return:', {
      data: { length: commandResult.length, type: 'string' },
    });

    const result = commandResult;
    this.logger.log('AppController -> getRoot -> return:', {
      data: { length: result.length, type: 'string' },
    });

    return result;
  }
}
