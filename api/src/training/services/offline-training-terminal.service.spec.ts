import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PutOfflineTrainingSnapshotV1Request } from '@dall-fit/types';

import { OfflineTrainingExecutionImmutableError } from '~/training/errors/offline-training-snapshot.errors';
import { OfflineTrainingTerminalService } from '~/training/services/offline-training-terminal.service';
import type { TrainingService } from '~/training/services/training.service';

describe('OfflineTrainingTerminalService', () => {
  const completedRequest = {
    executionId: '11111111-1111-4111-8111-111111111111',
    revision: 3,
    snapshot: { state: 'completed' },
  } as PutOfflineTrainingSnapshotV1Request;
  const completion = {
    id: '64b000000000000000000086',
  } as Awaited<ReturnType<TrainingService['completion']>>;
  const stored = {
    acceptedAt: new Date('2026-09-14T12:10:00.000Z'),
    contentHash: 'a'.repeat(64),
    createdAt: new Date('2026-09-14T12:10:00.000Z'),
    executionId: completedRequest.executionId,
    id: '64b000000000000000000087',
    personId: '64b000000000000000000088',
    revision: 3,
    terminalState: 'completed' as const,
    updatedAt: new Date('2026-09-14T12:10:00.000Z'),
    workoutExecutionId: completion.id,
  };
  const receipts = { create: vi.fn(), find: vi.fn() };
  const training = {
    completeOfflineSnapshot: vi.fn(),
    completion: vi.fn(),
  };
  let service: OfflineTrainingTerminalService;

  beforeEach(() => {
    vi.clearAllMocks();
    receipts.create.mockResolvedValue(stored);
    receipts.find.mockResolvedValue(null);
    training.completeOfflineSnapshot.mockResolvedValue(completion);
    training.completion.mockResolvedValue(completion);
    service = new OfflineTrainingTerminalService(
      receipts,
      training as unknown as TrainingService,
    );
  });

  it('persists completion before exposing its canonical result', async () => {
    const result = await service.process({
      acceptedAt: '2026-09-14T12:10:00.000Z',
      contentHash: stored.contentHash,
      personId: stored.personId,
      request: completedRequest,
    });
    expect(result).toMatchObject({
      completion,
      snapshotState: 'completed',
      state: 'completed',
    });
    expect(receipts.create).toHaveBeenCalledWith(
      expect.objectContaining({ workoutExecutionId: completion.id }),
    );
  });

  it('replays an identical durable completion', async () => {
    receipts.find.mockResolvedValueOnce(stored);
    const result = await service.replay(
      stored.personId,
      completedRequest,
      stored.contentHash,
    );
    expect(result).toMatchObject({
      completion,
      state: 'duplicate-completed',
    });
    expect(training.completeOfflineSnapshot).not.toHaveBeenCalled();
  });

  it('keeps a durable terminal immutable', async () => {
    receipts.find.mockResolvedValueOnce(stored);
    await expect(
      service.replay(stored.personId, completedRequest, 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(OfflineTrainingExecutionImmutableError);
  });

  it('cancels without creating an execution', async () => {
    const cancelledRequest = {
      ...completedRequest,
      snapshot: { state: 'cancelled' },
    } as PutOfflineTrainingSnapshotV1Request;
    receipts.create.mockResolvedValueOnce({
      ...stored,
      terminalState: 'cancelled',
      workoutExecutionId: undefined,
    });
    const result = await service.process({
      acceptedAt: '2026-09-14T12:10:00.000Z',
      contentHash: stored.contentHash,
      personId: stored.personId,
      request: cancelledRequest,
    });
    expect(result.state).toBe('cancelled');
    expect(training.completeOfflineSnapshot).not.toHaveBeenCalled();
  });
});
