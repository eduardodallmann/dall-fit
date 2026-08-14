import { describe, expect, it } from 'vitest';

import type { Exercise } from '@dall-fit/types';

import {
  getSignedImageRefreshDelay,
  isSignedImageNearExpiration,
} from '~/routes/training-plan/signed-image-urls';

function imageExercise(expiresAt: string): Exercise {
  return {
    bodyArea: 'other',
    id: 'image-1',
    image: {
      displayUrl: 'https://private.blob.test/display?signed=fake',
      signedUrlExpiresAt: expiresAt,
      thumbnailUrl: 'https://private.blob.test/thumbnail?signed=fake',
    },
    name: 'Imagem',
    repetitions: 12,
    restSeconds: 60,
    sets: 3,
    type: 'image',
  };
}

describe('signed image URL renewal', () => {
  const now = Date.parse('2026-08-14T12:00:00.000Z');

  it('schedules renewal two minutes before the earliest expiration', () => {
    const exercise = imageExercise('2026-08-14T12:15:00.000Z');

    expect(getSignedImageRefreshDelay([exercise], now)).toBe(13 * 60 * 1000);
  });

  it('renews immediately when the URL is inside the safety window', () => {
    const expiresAt = '2026-08-14T12:01:00.000Z';

    expect(getSignedImageRefreshDelay([imageExercise(expiresAt)], now)).toBe(0);
    expect(isSignedImageNearExpiration(expiresAt, now)).toBe(true);
  });

  it('ignores exercises without a signed image', () => {
    expect(
      getSignedImageRefreshDelay(
        [{ id: 'pause-1', restSeconds: 60, type: 'pause' }],
        now,
      ),
    ).toBeUndefined();
  });
});
