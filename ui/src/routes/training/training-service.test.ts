import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '~/core/http/api-client';
import { createTrainingSessionFixture } from '~/mocks/fixtures/training';
import {
  completeRemainingTrainingSeries,
  completeTrainingSeries,
  saveTrainingLoad,
} from '~/routes/training/training-service';

const exerciseId = '64b000000000000000000201';

describe('training service', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serializes an empty load as null with the canonical session version', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
      data: { data: createTrainingSessionFixture('session-running') },
    });

    await saveTrainingLoad(exerciseId, 1, null, 7, 'session-running');

    const call = put.mock.calls[0] as unknown as [
      string,
      { loadKg: number | null },
      { headers: Record<string, string> },
    ];
    expect(call[0]).toBe(
      `/training/session/exercises/${exerciseId}/series/1/load`,
    );
    expect(call[1]).toEqual({ loadKg: null });
    expect(call[2].headers).toMatchObject({ 'X-Resource-Version': '7' });
  });

  it('completes one or all remaining series with optional integer loads', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { data: createTrainingSessionFixture('session-running') },
    });

    await completeTrainingSeries(exerciseId, 1, null, 3, 'session-running');
    await completeRemainingTrainingSeries(
      exerciseId,
      [null, 0, 17],
      4,
      'session-running',
    );

    const calls = post.mock.calls as unknown as Array<
      [string, unknown, { headers: Record<string, string> }]
    >;
    expect(calls[0]?.[1]).toEqual({ loadKg: null });
    expect(calls[1]?.[1]).toEqual({ loadsKg: [null, 0, 17] });
    expect(calls[1]?.[2].headers).toMatchObject({
      'X-Resource-Version': '4',
    });
  });
});
