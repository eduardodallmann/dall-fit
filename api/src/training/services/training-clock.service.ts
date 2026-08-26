import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TrainingClockService {
  private readonly logger = new Logger(TrainingClockService.name);

  now(): Date {
    const result = new Date();
    this.logger.log('TrainingClockService -> now -> return:', {
      data: { resolved: true },
    });
    return result;
  }
}
