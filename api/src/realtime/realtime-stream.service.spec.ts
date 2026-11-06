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
    const service = new RealtimeStreamService(subscriber, {
      access: vi.fn().mockResolvedValue({ state: 'accepted' }),
    } as never);
    const stream = service.stream({
      personId: 'person-a',
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
  it('delivers terms during pendency and suppresses business events', async () => {
    let listener: ((event: InternalRealtimeEvent) => void) | undefined;
    const subscriber = {
      subscribe: vi.fn((next: (event: InternalRealtimeEvent) => void) => {
        listener = next;
        return vi.fn();
      }),
    } as unknown as RealtimeSubscriberService;
    const access = vi.fn().mockResolvedValue({ state: 'required' });
    const service = new RealtimeStreamService(subscriber, { access } as never);
    const stream = service.stream({
      personId: 'person-a',
      clientInstanceId: 'document-a',
      isAdmin: false,
    });
    const received: unknown[] = [];
    const subscription = stream.subscribe((event) => received.push(event));
    listener?.({
      audience: 'admin',
      event: {
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 1,
      },
      originClientInstanceId: 'document-b',
    });
    await Promise.resolve();
    listener?.({
      audience: 'admin',
      event: {
        resource: 'terms',
        resourceId: '109000000000000000000001',
        state: 'present',
        version: 2,
      },
      originClientInstanceId: 'document-b',
    });
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({
      data: { resource: 'terms', version: 2 },
    });
    expect(access).toHaveBeenCalledWith('person-a');
    subscription.unsubscribe();
  });
  it('delivers administrative invalidations without requiring a legal receipt', () => {
    let listener: ((event: InternalRealtimeEvent) => void) | undefined;
    const subscriber = {
      subscribe: vi.fn((next: (event: InternalRealtimeEvent) => void) => {
        listener = next;
        return vi.fn();
      }),
    } as unknown as RealtimeSubscriberService;
    const access = vi.fn().mockRejectedValue(new Error('Terms unavailable'));
    const service = new RealtimeStreamService(subscriber, { access } as never);
    const received: unknown[] = [];
    const subscription = service
      .stream({
        personId: 'admin-a',
        clientInstanceId: 'document-a',
        isAdmin: true,
      })
      .subscribe((event) => received.push(event));
    listener?.({
      audience: 'admin',
      event: {
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'present',
        version: 2,
      },
      originClientInstanceId: 'document-b',
    });
    expect(received[1]).toMatchObject({
      data: { resource: 'global-training-plan' },
    });
    expect(access).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
