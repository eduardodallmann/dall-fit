import { describe, expect, it } from 'vitest';

import type { PutOfflineTrainingSnapshotV1Request } from '@dall-fit/types';

import { OfflineTrainingSnapshotContentService } from '~/training/services/offline-training-snapshot-content.service';

describe('OfflineTrainingSnapshotContentService', () => {
  it('produces the same hash regardless of incidental property order', () => {
    const service = new OfflineTrainingSnapshotContentService();
    const first = {
      payloadVersion: 1,
      revision: 0,
      snapshot: { activeTimer: null, plan: {}, startedAt: '', workout: {} },
    } as unknown as PutOfflineTrainingSnapshotV1Request;
    const second = {
      snapshot: { workout: {}, startedAt: '', plan: {}, activeTimer: null },
      revision: 0,
      payloadVersion: 1,
    } as unknown as PutOfflineTrainingSnapshotV1Request;

    expect(service.prepare(first).contentHash).toBe(
      service.prepare(second).contentHash,
    );
  });
});
