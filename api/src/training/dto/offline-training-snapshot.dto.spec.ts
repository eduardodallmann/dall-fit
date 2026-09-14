import type { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { OfflineTrainingSnapshotValidationPipe } from '~/training/dto/offline-training-snapshot.dto';

function validRequest(): Record<string, unknown> {
  return {
    clientUpdatedAt: '2026-09-14T12:05:00.000Z',
    executionId: '11111111-1111-4111-8111-111111111111',
    installationId: '22222222-2222-4222-8222-222222222222',
    leaseId: '33333333-3333-4333-8333-333333333333',
    payloadVersion: 1,
    revision: 0,
    snapshot: {
      activeTimer: {
        durationSeconds: 60,
        exerciseId: '64b000000000000000000201',
        kind: 'series-rest',
        seriesNumber: 1,
        startedAt: '2026-09-14T12:04:00.000Z',
      },
      state: 'in-progress',
      plan: {
        catalogEntryId: '74b000000000000000000001',
        name: 'Captured plan',
        planId: '64b000000000000000000001',
        source: 'owned',
        workouts: [
          {
            bodyAreas: ['chest'],
            id: '64b000000000000000000101',
            name: 'Workout A',
          },
        ],
      },
      startedAt: '2026-09-14T12:00:00.000Z',
      workout: {
        exercises: [
          {
            bodyArea: 'chest',
            completedAt: null,
            id: '64b000000000000000000201',
            name: 'Exercise A',
            repetitions: 10,
            restSeconds: 60,
            series: [
              {
                completedAt: '2026-09-14T12:03:00.000Z',
                loadKg: null,
                number: 1,
                repetitions: 10,
              },
            ],
            sets: 1,
            type: 'youtube-short',
            youtubeId: 'ZA8gs8XP2bs',
          },
        ],
        id: '64b000000000000000000101',
        name: 'Workout A',
      },
    },
  };
}

function caught(action: () => unknown): HttpException {
  try {
    action();
  } catch (error: unknown) {
    return error as HttpException;
  }
  throw new Error('Expected validation to fail.');
}

describe('OfflineTrainingSnapshotValidationPipe', () => {
  const pipe = new OfflineTrainingSnapshotValidationPipe();

  it('accepts a strict, internally related v1 tree', () => {
    expect(pipe.transform(validRequest())).toMatchObject({
      payloadVersion: 1,
      revision: 0,
    });
  });

  it.each(['completed', 'cancelled'] as const)(
    'accepts a coherent %s terminal snapshot',
    (state) => {
      const request = validRequest();
      const snapshot = request.snapshot as Record<string, unknown>;
      snapshot.activeTimer = null;
      snapshot.state = state;
      if (state === 'completed') {
        snapshot.completedAt = '2026-09-14T12:06:00.000Z';
        snapshot.timezone = 'America/Sao_Paulo';
      } else {
        snapshot.cancelledAt = '2026-09-14T12:06:00.000Z';
      }
      expect(pipe.transform(request).snapshot.state).toBe(state);
    },
  );

  it('rejects a terminal before a completed action', () => {
    const request = validRequest();
    const snapshot = request.snapshot as Record<string, unknown>;
    snapshot.activeTimer = null;
    snapshot.state = 'completed';
    snapshot.completedAt = '2026-09-14T12:02:00.000Z';
    snapshot.timezone = 'America/Sao_Paulo';
    expect(caught(() => pipe.transform(request)).getStatus()).toBe(400);
  });

  it.each([
    {
      bodyArea: 'chest',
      completedAt: null,
      id: '64b000000000000000000201',
      name: 'Image exercise',
      repetitions: 10,
      restSeconds: 60,
      series: [
        {
          completedAt: null,
          loadKg: 20,
          number: 1,
          repetitions: 10,
        },
      ],
      sets: 1,
      type: 'image',
    },
    {
      bodyArea: 'cardio',
      completedAt: null,
      id: '64b000000000000000000201',
      name: 'Long video',
      type: 'youtube-long',
      youtubeId: 'ZA8gs8XP2bs',
    },
    {
      completedAt: null,
      id: '64b000000000000000000201',
      restSeconds: 60,
      type: 'pause',
    },
    {
      bodyArea: 'cardio',
      completedAt: null,
      durationMinutes: 15,
      id: '64b000000000000000000201',
      instructions: 'Keep a steady pace.',
      name: 'Duration activity',
      type: 'duration',
      youtubeId: 'ZA8gs8XP2bs',
    },
  ])(
    'accepts the captured $type discriminator without foreign fields',
    (exercise) => {
      const request = validRequest();
      const snapshot = request.snapshot as {
        activeTimer: unknown;
        workout: { exercises: unknown[] };
      };
      snapshot.activeTimer = null;
      snapshot.workout.exercises = [exercise];
      expect(pipe.transform(request).snapshot.workout.exercises[0]?.type).toBe(
        exercise.type,
      );
    },
  );

  it.each([
    [
      {
        completedAt: null,
        id: '64b000000000000000000201',
        restSeconds: 60,
        type: 'pause',
      },
      { durationSeconds: 60, kind: 'pause' },
    ],
    [
      {
        bodyArea: 'cardio',
        completedAt: null,
        durationMinutes: 15,
        id: '64b000000000000000000201',
        name: 'Duration activity',
        type: 'duration',
      },
      { durationSeconds: 900, kind: 'duration' },
    ],
  ])('accepts a compatible %s timer', (exercise, timer) => {
    const request = validRequest();
    const snapshot = request.snapshot as {
      activeTimer: Record<string, unknown>;
      workout: { exercises: unknown[] };
    };
    snapshot.workout.exercises = [exercise];
    snapshot.activeTimer = {
      ...timer,
      exerciseId: '64b000000000000000000201',
      startedAt: '2026-09-14T12:04:00.000Z',
    };
    expect(pipe.transform(request).snapshot.activeTimer?.kind).toBe(timer.kind);
  });

  it.each([
    [
      'unknown version',
      (request: Record<string, unknown>) => (request.payloadVersion = 2),
    ],
    [
      'additional field',
      (request: Record<string, unknown>) => (request.personId = 'forbidden'),
    ],
    [
      'revision overflow',
      (request: Record<string, unknown>) => (request.revision = 2_147_483_648),
    ],
    [
      'timestamp without timezone',
      (request: Record<string, unknown>) =>
        (request.clientUpdatedAt = '2026-09-14T12:05:00'),
    ],
    [
      'unrelated workout',
      (request: Record<string, unknown>) => {
        const snapshot = request.snapshot as { workout: { id: string } };
        snapshot.workout.id = '64b000000000000000000999';
      },
    ],
    [
      'nonconsecutive series',
      (request: Record<string, unknown>) => {
        const snapshot = request.snapshot as {
          workout: { exercises: { series: { number: number }[] }[] };
        };
        snapshot.workout.exercises[0].series[0].number = 2;
      },
    ],
    [
      'incompatible timer',
      (request: Record<string, unknown>) => {
        const snapshot = request.snapshot as {
          activeTimer: { kind: string };
        };
        snapshot.activeTimer.kind = 'duration';
      },
    ],
  ])('rejects %s before the command', (_name, mutate) => {
    const request = validRequest();
    mutate(request);
    const error = caught(() => pipe.transform(request));
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('uses the specific 413 error before schema validation', () => {
    const error = caught(() =>
      pipe.transform({ extra: 'x'.repeat(1024 * 1024) }),
    );
    expect(error.getStatus()).toBe(413);
    expect(error.getResponse()).toMatchObject({
      code: 'OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE',
    });
  });
});
