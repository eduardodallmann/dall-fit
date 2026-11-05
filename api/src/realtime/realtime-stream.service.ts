import { Injectable, Logger, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

import { RealtimeSubscriberService } from '~/realtime/realtime-subscriber.service';
import {
  REALTIME_CONNECTION_LIFETIME_MS,
  REALTIME_HEARTBEAT_MS,
} from '~/realtime/realtime.constants';
import type { RealtimeConnection } from '~/realtime/realtime.types';
import { TermsAccessService } from '~/terms/services/terms-access.service';

@Injectable()
export class RealtimeStreamService {
  private activeConnections = 0;
  private readonly logger = new Logger(RealtimeStreamService.name);

  constructor(
    private readonly subscriber: RealtimeSubscriberService,
    private readonly termsAccess: TermsAccessService,
  ) {}

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
        void (async () => {
          const isTermsEvent = envelope.event?.resource === 'terms';
          if (!isTermsEvent) {
            const access = await this.termsAccess.access(connection.personId);
            if (access.state !== 'accepted') return;
          }
          const isGlobalTrainingPlanEvent =
            envelope.event?.resource === 'global-training-plan';
          if (
            !connection.isAdmin &&
            !isGlobalTrainingPlanEvent &&
            !isTermsEvent
          ) {
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
        })().catch(() => {
          this.logger.warn(
            'RealtimeStreamService -> stream -> termsUnavailable branch:',
            { data: { delivered: false } },
          );
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
