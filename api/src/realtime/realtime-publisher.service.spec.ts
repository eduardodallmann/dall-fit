import { AsyncLocalStorage } from 'node:async_hooks';

import { describe, expect, it, vi } from 'vitest';

import type { RequestContext } from '~/observability/request-context';
import { RealtimePublisherService } from '~/realtime/realtime-publisher.service';
import type { RedisClientService } from '~/redis/redis-client.service';

describe('RealtimePublisherService', () => {
  it('uses the namespaced channel and includes the ephemeral request origin', async () => {
    const publish = vi.fn().mockResolvedValue(1);
    const redis = {
      execute: vi.fn(
        (operation: (client: { publish: typeof publish }) => Promise<number>) =>
          operation({ publish }),
      ),
    } as unknown as RedisClientService;
    const keys = {
      create: vi.fn().mockReturnValue('dall-fit:test:realtime:events'),
    };
    const storage = new AsyncLocalStorage<RequestContext>();
    const service = new RealtimePublisherService(redis, keys as never, storage);

    await storage.run(
      {
        clientInstanceId: '123e4567-e89b-42d3-a456-426614174000',
        requestId: 'request-a',
      },
      () =>
        service.publish({
          resource: 'global-training-plan',
          resourceId: 'plan-a',
          state: 'present',
          version: 2,
        }),
    );

    expect(keys.create).toHaveBeenCalledWith('realtime', 'events');
    expect(publish).toHaveBeenCalledWith(
      'dall-fit:test:realtime:events',
      JSON.stringify({
        audience: 'admin',
        event: {
          resource: 'global-training-plan',
          resourceId: 'plan-a',
          state: 'present',
          version: 2,
        },
        originClientInstanceId: '123e4567-e89b-42d3-a456-426614174000',
      }),
    );
  });

  it('keeps a committed write successful when Redis publication fails', async () => {
    const redis = {
      execute: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    } as unknown as RedisClientService;
    const config = {
      create: vi.fn().mockReturnValue('dall-fit:test:realtime:events'),
    };
    const storage = new AsyncLocalStorage<RequestContext>();
    const service = new RealtimePublisherService(
      redis,
      config as never,
      storage,
    );

    await expect(
      service.publish({
        resource: 'global-training-plan',
        resourceId: 'plan-a',
        state: 'deleted',
      }),
    ).resolves.toBeUndefined();
  });
});
