import { firstValueFrom, take, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { RealtimeStreamService } from '~/realtime/realtime-stream.service';
import type { RealtimeSubscriberService } from '~/realtime/realtime-subscriber.service';
import type { InternalRealtimeEvent } from '~/realtime/realtime.types';

describe('RealtimeStreamService', () => {
  it('announces readiness and suppresses the originating document', async () => {
    let listener: ((event: InternalRealtimeEvent) => void) | undefined;
    const subscriber = {
      subscribe: vi.fn((next: (event: InternalRealtimeEvent) => void) => {
        listener = next;
        return vi.fn();
      }),
    } as unknown as RealtimeSubscriberService;
    const service = new RealtimeStreamService(subscriber);
    const stream = service.stream({
      clientInstanceId: 'document-a',
      isAdmin: true,
    });
    const eventsPromise = firstValueFrom(stream.pipe(take(2), toArray()));
    listener?.({
      audience: 'admin',
      event: {
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 4,
      },
      originClientInstanceId: 'document-a',
    });
    listener?.({
      audience: 'admin',
      event: {
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 4,
      },
      originClientInstanceId: 'document-b',
    });

    const events = await eventsPromise;
    expect(events.map((event) => event.type)).toEqual([
      'realtime-ready',
      'resource-invalidated',
    ]);
  });
});
