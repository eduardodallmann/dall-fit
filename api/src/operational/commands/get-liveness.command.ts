import { Injectable, Logger } from '@nestjs/common';

export interface LivenessResponse {
  status: 'ok';
}

@Injectable()
export class GetLivenessCommand {
  private readonly logger = new Logger(GetLivenessCommand.name);

  execute(): LivenessResponse {
    this.logger.log('GetLivenessCommand -> execute -> params:', {
      params: {},
    });
    const result: LivenessResponse = { status: 'ok' };
    this.logger.log('GetLivenessCommand -> execute -> return:', {
      data: result,
    });

    return result;
  }
}
