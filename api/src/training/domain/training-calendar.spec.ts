import { describe, expect, it } from 'vitest';

import {
  assertValidTimezone,
  getEightWeekRange,
  getLast30DaysRange,
  getWeekRange,
} from '~/training/domain/training-calendar';

describe('training calendar', () => {
  it('builds a Monday-to-Sunday week across a daylight-saving transition', () => {
    const range = getWeekRange(
      new Date('2026-03-08T16:00:00.000Z'),
      'America/New_York',
    );

    expect(range).toMatchObject({
      endDate: '2026-03-08',
      startDate: '2026-03-02',
    });
    expect(range.start.toISOString()).toBe('2026-03-02T05:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('uses thirty civil days and eight complete week buckets', () => {
    const now = new Date('2026-01-02T02:30:00.000Z');
    const last30 = getLast30DaysRange(now, 'America/Sao_Paulo');
    const trend = getEightWeekRange(now, 'America/Sao_Paulo');

    expect(last30).toMatchObject({
      endDate: '2026-01-01',
      startDate: '2025-12-03',
    });
    expect(last30.start.toISOString()).toBe('2025-12-03T03:00:00.000Z');
    expect(last30.end.toISOString()).toBe('2026-01-02T03:00:00.000Z');
    expect(trend).toMatchObject({
      endDate: '2026-01-04',
      startDate: '2025-11-10',
    });
  });

  it('rejects an unknown timezone', () => {
    expect(() => assertValidTimezone('Mars/Olympus')).toThrow(RangeError);
  });
});
