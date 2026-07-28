import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GetRootCommand {
  private readonly logger = new Logger(GetRootCommand.name);

  execute(): string {
    this.logger.log('GetRootCommand -> execute -> params:', { params: {} });

    const result = 'Hello World!';
    this.logger.log('GetRootCommand -> execute -> return:', {
      data: { length: result.length, type: 'string' },
    });

    return result;
  }
}
