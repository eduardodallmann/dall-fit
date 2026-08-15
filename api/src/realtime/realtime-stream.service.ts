import { Injectable, Logger, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

import { RealtimeSubscriberService } from '~/realtime/realtime-subscriber.service';
import {
  REALTIME_CONNECTION_LIFETIME_MS,
  REALTIME_HEARTBEAT_MS,
} from '~/realtime/realtime.constants';
import type { RealtimeConnection } from '~/realtime/realtime.types';

@Injectable()
export class RealtimeStreamService {
  private activeConnections = 0;
  private readonly logger = new Logger(RealtimeStreamService.name);

  constructor(private readonly subscriber: RealtimeSubscriberService) {}

  stream(connection: RealtimeConnection): Observable<MessageEvent> {
    this.logger.log('RealtimeStreamService -> stream -> params:', {
      params: { isAdmin: connection.isAdmin },
    });
    const result = new Observable<MessageEvent>((observer) => {
      const startedAt = Date.now();
      let closeReason = 'client';
      this.activeConnections += 1;
      this.logger.log('RealtimeStreamService -> stream -> opened:', {
        data: { activeConnections: this.activeConnections },
      });
      observer.next({ data: {}, retry: 3_000, type: 'realtime-ready' });
      const unsubscribe = this.subscriber.subscribe((envelope) => {
        if (!connection.isAdmin) {
          this.logger.log(
            'RealtimeStreamService -> stream -> audienceSuppressed branch:',
            { data: { audienceAccepted: false } },
          );
          return;
        }
        if (envelope.originClientInstanceId === connection.clientInstanceId) {
          this.logger.log(
            'RealtimeStreamService -> stream -> originSuppressed branch:',
            { data: { originMatched: true } },
          );
          return;
        }
        observer.next({
          data: envelope.event,
          type: 'resource-invalidated',
        });
      });
      const heartbeat = setInterval(() => {
        observer.next({ data: {}, type: 'heartbeat' });
      }, REALTIME_HEARTBEAT_MS);
      const lifetime = setTimeout(() => {
        closeReason = 'lifetime';
        observer.complete();
      }, REALTIME_CONNECTION_LIFETIME_MS);
      return () => {
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        unsubscribe();
        this.activeConnections = Math.max(0, this.activeConnections - 1);
        this.logger.log('RealtimeStreamService -> stream -> completed:', {
          data: {
            activeConnections: this.activeConnections,
            closeReason,
            durationMs: Date.now() - startedAt,
          },
        });
      };
    });
    this.logger.log('RealtimeStreamService -> stream -> return:', {
      data: { streamCreated: true },
    });
    return result;
  }
}
