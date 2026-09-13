import { describe, expect, it, vi } from 'vitest';

import type { TrainingOverview, TrainingWorkoutPreview } from '@dall-fit/types';

import { OfflinePreparationCoordinator } from './offline-preparation';
import type {
  OfflineFileMetadata,
  OfflineStoragePlugin,
  OfflineStoredAggregate,
} from './offline-storage-plugin';

const validity = {
  expiresAt: '2030-01-08T00:00:00.000Z',
  validatedAt: '2030-01-01T00:00:00.000Z',
};
const plan = {
  catalogEntryId: 'catalog-a',
  id: 'plan-a',
  name: 'Plano A',
  source: 'owned' as const,
  workoutCount: 1,
};
const overview: TrainingOverview = {
  offlinePreparation: { plan, workoutIds: ['workout-a'] },
  offlineValidity: validity,
  plan,
  workouts: [],
};
const preview: TrainingWorkoutPreview = {
  exercises: [
    {
      bodyArea: 'chest',
      id: 'exercise-a',
      image: {
        displayUrl: 'https://blob.example/display.webp?secret=value',
        offlineMediaId: 'opaque-a',
        signedUrlExpiresAt: '2030-01-01T00:15:00.000Z',
        thumbnailUrl: 'https://blob.example/thumbnail.webp?secret=value',
      },
      lastLoadsKg: [null],
      name: 'Supino',
      repetitions: 10,
      restSeconds: 60,
      sets: 1,
      type: 'image',
    },
  ],
  plan,
  workout: { id: 'workout-a', name: 'Treino A' },
};

function createPlugin() {
  let prepared: OfflineStoredAggregate | undefined;
  const files = new Map<string, OfflineFileMetadata>();
  const downloadFile = vi.fn<OfflineStoragePlugin['downloadFile']>(
    ({ fileId, planId, revision }) => {
      const file: OfflineFileMetadata = {
        contentType: 'image/webp',
        fileId,
        planId,
        revision,
        sizeBytes: 10,
        status: 'ready',
        updatedAt: validity.validatedAt,
      };
      files.set(fileId, file);
      return Promise.resolve({ file });
    },
  );
  const getFile: OfflineStoragePlugin['getFile'] = ({ fileId }) =>
    Promise.resolve({ file: files.get(fileId) });
  const getPreparedPlan: OfflineStoragePlugin['getPreparedPlan'] = () =>
    Promise.resolve({ aggregate: prepared });
  const putPreparedPlan: OfflineStoragePlugin['putPreparedPlan'] = (input) => {
    prepared = {
      expiresAt: input.expiresAt,
      id: input.planId,
      payload: input.payload,
      payloadVersion: input.payloadVersion,
      planId: input.planId,
      revision: input.revision,
      updatedAt: input.validatedAt,
      validatedAt: input.validatedAt,
    };
    return Promise.resolve();
  };
  const removeFile: OfflineStoragePlugin['removeFile'] = ({ fileId }) => {
    const removed = files.delete(fileId);
    return Promise.resolve({ removed });
  };
  const removePreparedPlan: OfflineStoragePlugin['removePreparedPlan'] = () => {
    const removed = prepared !== undefined;
    prepared = undefined;
    return Promise.resolve({ removed });
  };
  const partialPlugin: Pick<
    OfflineStoragePlugin,
    | 'downloadFile'
    | 'getFile'
    | 'getPreparedPlan'
    | 'putPreparedPlan'
    | 'removeFile'
    | 'removePreparedPlan'
  > = {
    downloadFile,
    getFile: vi.fn(getFile),
    getPreparedPlan: vi.fn(getPreparedPlan),
    putPreparedPlan: vi.fn(putPreparedPlan),
    removeFile: vi.fn(removeFile),
    removePreparedPlan: vi.fn(removePreparedPlan),
  };
  const plugin = partialPlugin as OfflineStoragePlugin;
  return { downloadFile, plugin, readPrepared: () => prepared };
}

describe('OfflinePreparationCoordinator', () => {
  it('commits essential data without signed URLs before downloading display media', async () => {
    const { downloadFile, plugin, readPrepared } = createPlugin();
    let releaseDownload: (() => void) | undefined;
    downloadFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseDownload = () =>
            resolve({
              file: {
                contentType: 'image/webp',
                fileId: 'display-opaque-a',
                planId: 'plan-a',
                revision: 1,
                sizeBytes: 10,
                status: 'ready',
                updatedAt: validity.validatedAt,
              },
            });
        }),
    );
    const coordinator = new OfflinePreparationCoordinator({
      getOverview: vi.fn().mockResolvedValue(overview),
      getPreview: vi.fn().mockResolvedValue(preview),
      now: () => Date.parse(validity.validatedAt),
      plugin,
    });

    const preparing = coordinator.enter();
    await vi.waitFor(() =>
      expect(coordinator.getSnapshot().status).toBe(
        'data-ready-media-in-progress',
      ),
    );
    expect(JSON.stringify(readPrepared()?.payload)).not.toContain('https://');
    expect(JSON.stringify(readPrepared()?.payload)).toContain(
      'display-opaque-a',
    );
    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'display-opaque-a',
        url:
          preview.exercises[0]?.type === 'image'
            ? preview.exercises[0].image?.displayUrl
            : undefined,
      }),
    );
    releaseDownload?.();
    await preparing;
    expect(coordinator.getSnapshot().status).toBe('ready');
  });

  it('coalesces concurrent entries into one overview composition', async () => {
    const { plugin } = createPlugin();
    const getOverview = vi.fn().mockResolvedValue({
      ...overview,
      offlinePreparation: { plan, workoutIds: [] },
    });
    const coordinator = new OfflinePreparationCoordinator({
      getOverview,
      getPreview: vi.fn(),
      plugin,
    });
    await Promise.all([coordinator.enter(), coordinator.enter()]);
    expect(getOverview).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().status).toBe('ready');
  });

  it('keeps a valid snapshot unblocked when refresh fails', async () => {
    const { plugin } = createPlugin();
    await plugin.putPreparedPlan({
      expiresAt: validity.expiresAt,
      payload: { plan, workouts: [] },
      payloadVersion: 1,
      planId: plan.id,
      revision: 1,
      validatedAt: validity.validatedAt,
    });
    const coordinator = new OfflinePreparationCoordinator({
      getOverview: vi.fn().mockRejectedValue(new Error('network')),
      getPreview: vi.fn(),
      now: () => Date.parse(validity.validatedAt),
      plugin,
    });
    await coordinator.enter();
    expect(coordinator.getSnapshot()).toEqual({
      error: true,
      status: 'ready',
    });
  });
});
