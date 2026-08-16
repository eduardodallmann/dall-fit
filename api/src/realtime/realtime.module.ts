import { Global, Module } from '@nestjs/common';

import { AuthModule } from '~/auth/auth.module';
import { RealtimePublisherService } from '~/realtime/realtime-publisher.service';
import { RealtimeStreamService } from '~/realtime/realtime-stream.service';
import { RealtimeSubscriberService } from '~/realtime/realtime-subscriber.service';
import { RealtimeController } from '~/realtime/realtime.controller';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [
    RealtimePublisherService,
    RealtimeStreamService,
    RealtimeSubscriberService,
  ],
  exports: [RealtimePublisherService],
})
export class RealtimeModule {}
