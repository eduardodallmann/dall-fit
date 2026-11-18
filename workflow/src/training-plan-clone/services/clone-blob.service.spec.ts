import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrainingPlanCloneJob } from '../domain';
import { CloneBlobService } from './clone-blob.service';

const { copyBlobMock, deleteBlobMock } = vi.hoisted(() => ({
  copyBlobMock: vi.fn(),
  deleteBlobMock: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  copy: copyBlobMock,
  del: deleteBlobMock,
}));

const job = {
  _id: '64b000000000000000000001',
  cancelRequestedAt: null,
  completedImages: 0,
  copiedImages: [],
  generation: 1,
  personId: '64b000000000000000000002',
  snapshot: {
    description: 'Descrição',
    name: 'Plano',
    sourceTrainingPlanId: '64b000000000000000000003',
    sourceVersion: 2,
    workouts: [
      {
        exercises: [
          {
            id: '64b000000000000000000004',
            image: {
              display: {
                etag: 'display-source-etag',
                height: 640,
                key: 'source/display.webp',
                width: 320,
              },
              thumbnail: {
                etag: 'thumbnail-source-etag',
                height: 160,
                key: 'source/thumbnail.webp',
                width: 80,
              },
            },
            type: 'image',
          },
        ],
        id: '64b000000000000000000005',
        name: 'Treino',
      },
    ],
  },
  state: 'running',
  workflowRunId: 'run-1',
} satisfies TrainingPlanCloneJob;

describe('CloneBlobService', () => {
  beforeEach(() => {
    process.env.BLOB_STORE_ID = 'store-id';
    copyBlobMock.mockReset();
    deleteBlobMock.mockReset();
  });

  it.each(['image', 'duration'] as const)(
    'copies %s variants with ETags and deterministic paths',
    async (type) => {
      copyBlobMock
        .mockResolvedValueOnce({
          pathname: 'exercise-images/f79ea6abd92d85d5822b29f4/thumbnail.webp',
        })
        .mockResolvedValueOnce({
          pathname: 'exercise-images/f79ea6abd92d85d5822b29f4/display.webp',
        });
      const service = new CloneBlobService();

      const result = await service.copyExerciseImage(
        {
          ...job,
          snapshot: {
            ...job.snapshot,
            workouts: job.snapshot.workouts.map((workout) => ({
              ...workout,
              exercises: workout.exercises.map((exercise) => ({
                ...exercise,
                type,
              })),
            })),
          },
        },
        '64b000000000000000000004',
      );

      expect(copyBlobMock).toHaveBeenNthCalledWith(
        1,
        'source/thumbnail.webp',
        'exercise-images/f79ea6abd92d85d5822b29f4/thumbnail.webp',
        expect.objectContaining({
          allowOverwrite: true,
          ifMatch: 'thumbnail-source-etag',
          storeId: 'store-id',
        }),
      );
      expect(copyBlobMock).toHaveBeenNthCalledWith(
        2,
        'source/display.webp',
        'exercise-images/f79ea6abd92d85d5822b29f4/display.webp',
        expect.objectContaining({ ifMatch: 'display-source-etag' }),
      );
      expect(result).toMatchObject({
        display: { height: 640, width: 320 },
        thumbnail: { height: 160, width: 80 },
      });
    },
  );
});
