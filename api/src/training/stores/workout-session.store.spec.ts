import { describe, expect, it, vi } from 'vitest';

import type { RedisClientService } from '~/redis/redis-client.service';
import type { RedisKeyService } from '~/redis/redis-key.service';
import type { WorkoutSessionSnapshot } from '~/training/domain/training.types';
import { WorkoutSessionStore } from '~/training/stores/workout-session.store';

const personId = '507f1f77bcf86cd799439011';
const expiresAt = '2026-08-26T12:00:00.000Z';

function snapshot(version = 0): WorkoutSessionSnapshot {
  return {
    activeTimer: null,
    exercises: [],
    expiresAt,
    id: '00000000-0000-4000-8000-000000000070',
    personId,
    plan: {
      catalogEntryId: '507f1f77bcf86cd799439012',
      id: '507f1f77bcf86cd799439013',
      name: 'Plano de teste',
      source: 'owned',
      workoutCount: 1,
    },
    planWorkouts: [],
    startedAt: '2026-08-25T12:00:00.000Z',
    version,
    workout: { id: '507f1f77bcf86cd799439014', name: 'Treino A' },
  };
}

function createStore(client: {
  eval: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
}) {
  const redis = {
    execute: vi.fn((operation: (value: typeof client) => unknown) =>
      Promise.resolve(operation(client)),
    ),
  } as unknown as RedisClientService;
  const keys = {
    create: vi.fn((subject: string, identifier: string) =>
      ['test', subject, identifier].join(':'),
    ),
  } as unknown as RedisKeyService;
  return { client, store: new WorkoutSessionStore(redis, keys) };
}

describe('WorkoutSessionStore', () => {
  it('creates one absolute-TTL session and clears a previous completion receipt', async () => {
    const client = { eval: vi.fn().mockResolvedValue(1) };
    const { store } = createStore(client);

    await store.create(snapshot());

    const call = client.eval.mock.calls[0];
    expect(call?.slice(1, 6)).toEqual([
      3,
      `test:workout-session:${personId}`,
      `test:workout-session-expiry:${personId}`,
      `test:workout-completion-receipt:${personId}`,
      expect.any(String),
    ]);
    expect(call?.[6]).toBe(String(new Date(expiresAt).getTime()));
    expect(call?.[7]).toBe(snapshot().id);
  });

  it('preserves expiresAt while atomically incrementing the version', async () => {
    const client = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(JSON.stringify(snapshot())),
    };
    const { store } = createStore(client);

    const result = await store.update(
      personId,
      snapshot().id,
      0,
      (current) => ({ ...current, activeTimer: null }),
    );

    expect(result.version).toBe(1);
    expect(result.expiresAt).toBe(expiresAt);
    const call = client.eval.mock.calls[0];
    expect(call?.at(-1)).toBe(String(new Date(expiresAt).getTime()));
  });

  it('rejects the losing compare-and-set writer', async () => {
    const client = {
      eval: vi.fn().mockResolvedValue(-2),
      get: vi.fn().mockResolvedValue(JSON.stringify(snapshot())),
    };
    const { store } = createStore(client);

    await expect(
      store.update(personId, snapshot().id, 0, (current) => current),
    ).rejects.toMatchObject({
      response: { code: 'WORKOUT_SESSION_VERSION_CONFLICT' },
    });
  });
});
