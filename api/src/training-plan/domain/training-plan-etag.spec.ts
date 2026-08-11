import { describe, expect, it } from 'vitest';

import {
  formatTrainingPlanEtag,
  parseTrainingPlanIfMatch,
} from '~/training-plan/domain/training-plan-etag';

const trainingPlanId = '64b000000000000000000001';

describe('training plan ETag', () => {
  it('formats and parses the canonical strong tag', () => {
    const tag = formatTrainingPlanEtag(trainingPlanId, 12);
    expect(tag).toBe('"training-plan:64b000000000000000000001:12"');
    expect(parseTrainingPlanIfMatch(tag, trainingPlanId)).toBe(12);
  });

  it.each([
    undefined,
    'W/"training-plan:64b000000000000000000001:0"',
    '*',
    '"training-plan:64b000000000000000000001:0", "other"',
  ])('rejects absent or non-canonical values: %s', (value) => {
    try {
      parseTrainingPlanIfMatch(value, trainingPlanId);
      throw new Error('Expected parser to reject the value.');
    } catch (error) {
      expect(error).toMatchObject({ status: value === undefined ? 428 : 400 });
    }
  });
});
