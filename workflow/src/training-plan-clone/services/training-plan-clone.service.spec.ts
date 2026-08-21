import { describe, expect, it, vi } from 'vitest';

import type { TrainingPlanCloneJob } from '../domain';
import type { TrainingPlanCloneRepository } from '../repositories/training-plan-clone.repository';
import type { CloneBlobService } from './clone-blob.service';
import { TrainingPlanCloneService } from './training-plan-clone.service';

const job: TrainingPlanCloneJob = {
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
                etag: 'display-etag',
                height: 640,
                key: 'source/display.webp',
                width: 640,
              },
              thumbnail: {
                etag: 'thumbnail-etag',
                height: 160,
                key: 'source/thumbnail.webp',
                width: 160,
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
  state: 'queued',
  workflowRunId: null,
};

function setup(currentJob: TrainingPlanCloneJob | null = job) {
  const repositoryMocks = {
    beginFinalization: vi.fn().mockResolvedValue(true),
    claimRun: vi.fn().mockResolvedValue(true),
    cleanupKeys: vi.fn().mockResolvedValue(['clone/a.webp', 'clone/b.webp']),
    confirmCopiedImage: vi.fn().mockResolvedValue(undefined),
    findJob: vi.fn().mockResolvedValue(currentJob),
    markCancelled: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    materializeClone: vi.fn().mockResolvedValue(undefined),
    nextDecision: vi.fn().mockResolvedValue({ kind: 'finalize' }),
    reserveStart: vi.fn().mockResolvedValue('start'),
  };
  const repository = repositoryMocks as unknown as TrainingPlanCloneRepository;
  const copied = {
    display: { height: 640, key: 'clone/display.webp', width: 640 },
    exerciseId: '64b000000000000000000004',
    thumbnail: { height: 160, key: 'clone/thumbnail.webp', width: 160 },
  };
  const blobServiceMocks = {
    copyExerciseImage: vi.fn().mockResolvedValue(copied),
    deleteDestinations: vi.fn().mockResolvedValue(undefined),
  };
  const blobService = blobServiceMocks as unknown as CloneBlobService;
  return {
    blobService: blobServiceMocks,
    repository: repositoryMocks,
    service: new TrainingPlanCloneService(repository, blobService),
  };
}

describe('TrainingPlanCloneService', () => {
  it('reserves start with a bounded lease and rejects missing jobs', async () => {
    const now = new Date('2026-08-21T12:00:00.000Z');
    const { repository, service } = setup();
    await expect(service.reserveStart(job._id, 1, now)).resolves.toBe('start');
    expect(repository.reserveStart).toHaveBeenCalledWith(
      job._id,
      1,
      now,
      new Date(now.getTime() + 30_000),
    );

    const missing = setup(null).service.reserveStart(job._id, 1, now);
    await expect(missing).rejects.toEqual(
      expect.objectContaining({
        code: 'job-not-found',
      }),
    );
  });

  it('copies a bounded batch and confirms each complete image', async () => {
    const running = {
      ...job,
      state: 'running' as const,
      workflowRunId: 'run-1',
    };
    const { blobService, repository, service } = setup(running);
    await service.copyBatch(job._id, 1, 'run-1', ['64b000000000000000000004']);
    expect(blobService.copyExerciseImage).toHaveBeenCalledOnce();
    expect(repository.confirmCopiedImage).toHaveBeenCalledOnce();
  });

  it('materializes only after winning finalization and compensates cancellation', async () => {
    const { blobService, repository, service } = setup();
    await service.finalize(job._id, 1, 'run-1');
    expect(repository.materializeClone).toHaveBeenCalledOnce();

    await service.cleanup(job._id, 1, 'run-1');
    expect(blobService.deleteDestinations).toHaveBeenCalledWith([
      'clone/a.webp',
      'clone/b.webp',
    ]);
    expect(repository.markCancelled).toHaveBeenCalledOnce();
  });
});
