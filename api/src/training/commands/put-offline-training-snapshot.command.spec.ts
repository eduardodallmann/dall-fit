import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PutOfflineTrainingSnapshotV1Request } from '@dall-fit/types';

import { PutOfflineTrainingSnapshotCommand } from '~/training/commands/put-offline-training-snapshot.command';
import {
  OfflineTrainingSnapshotResolutionExpiredError,
  OfflineTrainingSnapshotSyncInProgressError,
} from '~/training/errors/offline-training-snapshot.errors';
import type { OfflineTrainingSnapshotContentService } from '~/training/services/offline-training-snapshot-content.service';
import type { OfflineTrainingSnapshotLockService } from '~/training/services/offline-training-snapshot-lock.service';
import type { OfflineTrainingSnapshotService } from '~/training/services/offline-training-snapshot.service';
import type { OfflineTrainingTerminalService } from '~/training/services/offline-training-terminal.service';

describe('PutOfflineTrainingSnapshotCommand', () => {
  const request = {
    executionId: '11111111-1111-4111-8111-111111111111',
    installationId: '22222222-2222-4222-8222-222222222222',
    payloadVersion: 1,
    revision: 0,
    snapshot: { state: 'in-progress' },
  } as PutOfflineTrainingSnapshotV1Request;
  const content = {
    prepare: vi.fn(() => ({
      contentHash: 'hash',
      serializedSnapshot: '{}',
    })),
  };
  const compatibility = { validateSnapshotClient: vi.fn() };
  const lock = { key: 'hidden-key', token: 'hidden-token' };
  const locks = { acquire: vi.fn(), release: vi.fn() };
  const snapshots = { ingest: vi.fn() };
  const terminals = { process: vi.fn(), replay: vi.fn() };
  let command: PutOfflineTrainingSnapshotCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    locks.acquire.mockResolvedValue(lock);
    locks.release.mockResolvedValue(undefined);
    snapshots.ingest.mockResolvedValue({
      contentHash: 'hash',
      effectiveRequest: request,
      result: {
        acceptedAt: '2026-09-14T12:00:00.000Z',
        executionId: request.executionId,
        expiresAt: '2026-09-21T12:00:00.000Z',
        orderedAt: '2026-09-14T11:59:00.000Z',
        revision: 0,
        snapshotState: 'in-progress',
        state: 'accepted',
      },
    });
    terminals.replay.mockResolvedValue(null);
    command = new PutOfflineTrainingSnapshotCommand(
      compatibility as never,
      content as unknown as OfflineTrainingSnapshotContentService,
      locks as unknown as OfflineTrainingSnapshotLockService,
      snapshots as unknown as OfflineTrainingSnapshotService,
      terminals as unknown as OfflineTrainingTerminalService,
    );
  });

  it('prepares once, locks, ingests and always releases', async () => {
    const result = await command.execute('hidden-person', request);
    expect(result.data.state).toBe('accepted');
    expect(content.prepare).toHaveBeenCalledWith(request);
    expect(locks.acquire).toHaveBeenCalledWith(request.installationId);
    expect(snapshots.ingest).toHaveBeenCalledWith({
      contentHash: 'hash',
      personId: 'hidden-person',
      request,
      serializedSnapshot: '{}',
    });
    expect(locks.release).toHaveBeenCalledWith(lock);
  });

  it('releases the lock and maps a domain conflict', async () => {
    snapshots.ingest.mockRejectedValueOnce(
      new OfflineTrainingSnapshotResolutionExpiredError(),
    );
    const error = await command
      .execute('hidden-person', request)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'OFFLINE_TRAINING_CONFLICT_TOKEN_STALE',
    });
    expect(locks.release).toHaveBeenCalledWith(lock);
  });

  it('does not enter the critical region when lock acquisition fails', async () => {
    locks.acquire.mockRejectedValueOnce(
      new OfflineTrainingSnapshotSyncInProgressError(),
    );
    const error = await command
      .execute('hidden-person', request)
      .catch((caught: unknown) => caught);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'OFFLINE_TRAINING_SYNC_IN_PROGRESS',
    });
    expect(snapshots.ingest).not.toHaveBeenCalled();
    expect(locks.release).not.toHaveBeenCalled();
  });

  it('rejects an incompatible client before content preparation or locking', async () => {
    compatibility.validateSnapshotClient.mockImplementationOnce(() => {
      throw new Error('incompatible');
    });

    await expect(
      command.execute('hidden-person', request, {
        appVersionCode: '0',
        syncContractVersion: '1',
      }),
    ).rejects.toThrow('incompatible');
    expect(content.prepare).not.toHaveBeenCalled();
    expect(locks.acquire).not.toHaveBeenCalled();
  });
});
