import { describe, expect, it, vi } from 'vitest';

import type { TrainingOverview, TrainingWorkoutPreview } from '@dall-fit/types';

import { NativeTrainingRepository } from './native-training-repository';
import type {
  OfflineStoragePlugin,
  OfflineStoredAggregate,
} from './offline-storage-plugin';

const plan = {
  catalogEntryId: 'catalog-a',
  id: 'plan-a',
  name: 'Plano A',
  source: 'owned' as const,
  workoutCount: 1,
};
const overview: TrainingOverview = {
  availablePlans: [plan],
  offlinePreparations: [
    {
      plan,
      validity: {
        expiresAt: '2030-01-08T00:00:00.000Z',
        validatedAt: '2030-01-01T00:00:00.000Z',
      },
      workoutIds: ['workout-a'],
    },
  ],
  plan,
  workouts: [
    {
      bodyAreas: ['chest'],
      id: 'workout-a',
      indicator: 'current',
      media: null,
      name: 'Treino A',
    },
  ],
};
const preview: TrainingWorkoutPreview = {
  exercises: [
    {
      bodyArea: 'chest',
      id: 'exercise-a',
      lastLoadsKg: [null, 10],
      name: 'Supino',
      repetitions: 12,
      restSeconds: 60,
      sets: 2,
      type: 'youtube-short',
      youtubeId: 'video-a',
    },
  ],
  plan,
  workout: { id: 'workout-a', name: 'Treino A' },
};

function createHarness(
  now = Date.parse('2030-01-02T00:00:00.000Z'),
  preparedPreview: TrainingWorkoutPreview = preview,
) {
  let active: OfflineStoredAggregate | undefined;
  const snapshots = new Map<string, OfflineStoredAggregate>();
  let uuid = 0;
  const prepared: OfflineStoredAggregate = {
    expiresAt: '2030-01-08T00:00:00.000Z',
    id: plan.id,
    payload: {
      lease: {
        expiresAt: '2030-01-08T00:00:00.000Z',
        installationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        leaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        planId: plan.id,
      },
      overview,
      plan,
      previews: [preparedPreview],
    },
    payloadVersion: 2,
    planId: plan.id,
    revision: 1,
    updatedAt: '2030-01-01T00:00:00.000Z',
  };
  const commitTrainingSession = vi.fn<
    OfflineStoragePlugin['commitTrainingSession']
  >((input) => {
    active = {
      id: input.sessionId,
      payload: input.sessionPayload,
      payloadVersion: 1,
      planId: input.planId,
      revision: input.revision,
      updatedAt: input.updatedAt,
    };
    snapshots.set(input.executionId, {
      id: input.executionId,
      payload: input.snapshotPayload,
      payloadVersion: 1,
      planId: input.planId,
      revision: input.revision,
      updatedAt: input.updatedAt,
    });
    return Promise.resolve();
  });
  const commitTrainingTerminal = vi.fn<
    OfflineStoragePlugin['commitTrainingTerminal']
  >((input) => {
    if (
      active?.id !== input.sessionId ||
      active.revision !== input.expectedSessionRevision
    )
      return Promise.reject(new Error('conflict'));
    active = undefined;
    snapshots.set(input.executionId, {
      id: input.executionId,
      payload: input.snapshotPayload,
      payloadVersion: 1,
      planId: input.planId,
      revision: input.revision,
      updatedAt: input.updatedAt,
    });
    return Promise.resolve();
  });
  const plugin = {
    commitTrainingSession,
    commitTrainingTerminal,
    getActiveSession: () => Promise.resolve({ aggregate: active }),
    getMonotonicTime: () => Promise.resolve({ elapsedRealtime: 1_000 }),
    getPreparedPlan: () => Promise.resolve({ aggregate: prepared }),
    listPreparedPlans: () => Promise.resolve({ aggregates: [prepared] }),
    getReadyFileUrl: () =>
      Promise.resolve({ url: 'content://com.dallfit.app.fileprovider/media' }),
  } as unknown as OfflineStoragePlugin;
  const repository = new NativeTrainingRepository(
    plugin,
    () => now,
    () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
  );
  return {
    commitTrainingSession,
    commitTrainingTerminal,
    plugin,
    repository,
    snapshots,
  };
}

describe('NativeTrainingRepository', () => {
  it.each(['series-rest', 'pause'] as const)(
    'confirms %s resolution only after committing session and snapshot',
    async (kind) => {
      const preparedPreview: TrainingWorkoutPreview =
        kind === 'pause'
          ? {
              ...preview,
              exercises: [{ id: 'pause-a', restSeconds: 30, type: 'pause' }],
            }
          : preview;
      const h = createHarness(undefined, preparedPreview);
      const started = await h.repository.startSession('workout-a');
      const running =
        kind === 'pause'
          ? await h.repository.startTimer('pause-a', 'pause', started.version)
          : await h.repository.completeSeries(
              'exercise-a',
              1,
              25,
              started.version,
            );
      const commit = h.commitTrainingSession.getMockImplementation()!;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.commitTrainingSession.mockImplementationOnce(async (input) => {
        await gate;
        await commit(input);
      });
      const resolving = h.repository.resolveTimer('finish', running.version);
      await vi.waitFor(() =>
        expect(h.commitTrainingSession).toHaveBeenCalledTimes(3),
      );
      expect((await h.repository.getSession()).activeTimer?.kind).toBe(kind);
      release();
      const resolved = await resolving;
      expect(resolved.activeTimer).toBeNull();
      expect(resolved.version).toBe(running.version + 1);
      expect([...h.snapshots.values()][0]?.revision).toBe(resolved.version);
      if (kind === 'pause')
        expect(resolved.exercises[0]?.completedAt).not.toBeNull();
      else expect(resolved.exercises).toEqual(running.exercises);
    },
  );

  it('preserves the native timer after a failed commit and permits explicit retry', async () => {
    const h = createHarness();
    const started = await h.repository.startSession('workout-a');
    const running = await h.repository.completeSeries(
      'exercise-a',
      1,
      null,
      started.version,
    );
    h.commitTrainingSession.mockRejectedValueOnce(
      new Error('SQLite unavailable'),
    );
    await expect(
      h.repository.resolveTimer('finish', running.version),
    ).rejects.toThrow('SQLite unavailable');
    expect((await h.repository.getSession()).activeTimer).not.toBeNull();
    expect([...h.snapshots.values()][0]?.revision).toBe(running.version);
    const resolved = await h.repository.resolveTimer('skip', running.version);
    expect(resolved.activeTimer).toBeNull();
    expect(resolved.version).toBe(running.version + 1);
  });

  it.each(['image', 'duration'] as const)(
    'projects a ready %s image and excludes media from sync',
    async (type) => {
      const imagePreview = {
        ...preview,
        exercises: [
          {
            bodyArea: 'chest',
            id: 'exercise-image',
            image: { fileId: 'display-image-a' },
            lastLoadsKg: [null],
            name: 'Crucifixo',
            repetitions: 10,
            restSeconds: 30,
            sets: 1,
            type,
            ...(type === 'duration' ? { durationMinutes: 2 } : {}),
          },
        ],
      } as unknown as TrainingWorkoutPreview;
      const harness = createHarness(
        Date.parse('2030-01-02T00:00:00.000Z'),
        imagePreview,
      );

      const projected = await harness.repository.getPreview('workout-a');
      expect(projected.exercises[0]).toMatchObject({
        image: {
          displayUrl: 'content://com.dallfit.app.fileprovider/media',
          offlineMediaId: 'display-image-a',
        },
      });
      const session = await harness.repository.startSession('workout-a');
      expect(session.exercises[0]).toMatchObject({
        type,
        image: { displayUrl: 'content://com.dallfit.app.fileprovider/media' },
      });
      expect(
        JSON.stringify([...harness.snapshots.values()][0]?.payload),
      ).not.toMatch(/"image":|"fileId":|display-image-a|https:/u);
      expect(
        JSON.stringify(harness.commitTrainingSession.mock.calls[0]?.[0]),
      ).not.toContain('content://');
    },
  );

  it('confirms start only after atomically persisting session and snapshot', async () => {
    const harness = createHarness();
    let release: (() => void) | undefined;
    harness.commitTrainingSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const starting = harness.repository.startSession('workout-a');
    let settled = false;
    void starting.then(() => {
      settled = true;
    });
    await vi.waitFor(() =>
      expect(harness.commitTrainingSession).toHaveBeenCalledOnce(),
    );
    expect(settled).toBe(false);
    release?.();
    const session = await starting;
    expect(session.exercises[0]).toMatchObject({
      completedAt: null,
      series: [{ loadKg: null }, { loadKg: 10 }],
    });
  });

  it('increments one revision per committed action and keeps the snapshot coalesced', async () => {
    const { repository, snapshots } = createHarness();
    const started = await repository.startSession('workout-a');
    const updated = await repository.saveLoad(
      'exercise-a',
      1,
      25,
      started.version,
    );
    expect(updated.version).toBe(1);
    expect(snapshots.size).toBe(1);
    expect([...snapshots.values()][0]?.revision).toBe(1);
  });

  it('keeps an existing session usable after validity but blocks a new start', async () => {
    let current = Date.parse('2030-01-02T00:00:00.000Z');
    const harness = createHarness(current);
    const repository = new NativeTrainingRepository(
      harness.plugin,
      () => current,
      () => crypto.randomUUID(),
    );
    const session = await repository.startSession('workout-a');
    current = Date.parse('2030-01-09T00:00:00.000Z');
    await expect(
      repository.saveLoad('exercise-a', 1, 20, session.version),
    ).resolves.toMatchObject({ version: 1 });
    await repository.abandonSession();
    await expect(repository.startSession('workout-a')).rejects.toMatchObject({
      code: 'CONNECTION_REQUIRED',
    });
  });

  it('commits a cancelled terminal before removing the active session', async () => {
    const { commitTrainingTerminal, repository, snapshots } = createHarness();
    await repository.startSession('workout-a');
    await repository.abandonSession();
    await expect(repository.getSession()).rejects.toMatchObject({
      code: 'WORKOUT_SESSION_NOT_FOUND',
    });
    expect(commitTrainingTerminal).toHaveBeenCalledOnce();
    expect(JSON.stringify([...snapshots.values()][0]?.payload)).toContain(
      'cancelled',
    );
  });

  it('commits a provisional completion projection with the terminal snapshot', async () => {
    const { commitTrainingTerminal, repository } = createHarness();
    const session = await repository.startSession('workout-a');

    await repository.completeSession(
      true,
      'America/Sao_Paulo',
      session.version,
    );

    expect(commitTrainingTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        completionPresentation: {
          completedAt: '2030-01-02T00:00:00.000Z',
          completedExerciseCount: 0,
          fullCompletion: false,
          totalExerciseCount: 1,
          workoutName: 'Treino A',
        },
      }),
    );
  });
});
