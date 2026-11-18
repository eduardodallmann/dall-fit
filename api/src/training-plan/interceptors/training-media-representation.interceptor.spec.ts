import { describe, expect, it } from 'vitest';

import { legacyTrainingMedia } from './training-media-representation.interceptor';

describe('legacyTrainingMedia', () => {
  it('omits duration images in nested library, preview, session and cover projections without mutating data', () => {
    const image = { displayUrl: 'private-url' };
    const duration = {
      type: 'duration',
      image,
      instructions: 'Continue pelo tempo.',
      durationMinutes: 2,
    };
    const body = {
      data: {
        exercises: [duration, { type: 'image', image }],
        media: { type: 'image', image, sourceExerciseType: 'duration' },
      },
    };
    expect(legacyTrainingMedia(body)).toEqual({
      data: {
        exercises: [
          {
            type: 'duration',
            instructions: duration.instructions,
            durationMinutes: 2,
          },
          { type: 'image', image },
        ],
        media: null,
      },
    });
    expect(body.data.exercises[0]).toHaveProperty('image', image);
  });
});
