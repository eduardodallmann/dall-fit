import {
  Controller,
  Logger,
  Query,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

import { Authenticated } from '~/auth/decorators/authenticated';
import { CurrentPerson } from '~/auth/decorators/current-person';
import { RateLimited } from '~/auth/decorators/rate-limited';
import { RateLimitGuard } from '~/auth/guards/rate-limit.guard';
import type { PersonEntity } from '~/person/domain/person.entity';
import { RealtimeStreamService } from '~/realtime/realtime-stream.service';
import { RealtimeEventsQueryDto } from '~/realtime/realtime.dto';

@Authenticated()
@Controller('realtime')
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);

  constructor(private readonly realtimeStream: RealtimeStreamService) {}

  @Sse('events')
  @RateLimited({
    bucket: 'realtime-connection',
    limitConfigKey: 'RATE_LIMIT_REALTIME_CONNECTION_LIMIT',
    subject: 'session-ip',
    windowConfigKey: 'RATE_LIMIT_REALTIME_CONNECTION_WINDOW_MS',
  })
  @UseGuards(RateLimitGuard)
  events(
    @Query() query: RealtimeEventsQueryDto,
    @CurrentPerson() person: PersonEntity,
  ): Observable<MessageEvent> {
    this.logger.log('RealtimeController -> events -> params:', {
      params: { isAdmin: person.isAdmin === true },
    });
    const result = this.realtimeStream.stream({
      clientInstanceId: query.clientInstanceId,
      isAdmin: person.isAdmin === true,
    });
    this.logger.log('RealtimeController -> events -> return:', {
      data: { streamCreated: true },
    });
    return result;
  }
}
