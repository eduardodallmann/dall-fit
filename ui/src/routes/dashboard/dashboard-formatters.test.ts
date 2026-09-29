import { describe, expect, it } from 'vitest';

import {
  formatDashboardDateTime,
  formatDashboardDuration,
  formatDashboardWeek,
} from '~/routes/dashboard/dashboard-formatters';

describe('dashboard formatters', () => {
  it.each([
    [0, '0 min'],
    [59, '0 min'],
    [3600, '1 h'],
    [5460, '1 h 31 min'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDashboardDuration(seconds)).toBe(expected);
  });

  it('formats the same instant in the browser timezone supplied to the route', () => {
    expect(
      formatDashboardDateTime('2026-09-29T02:30:00.000Z', 'America/Sao_Paulo'),
    ).toMatch(/^28\/09\/2026, 23:30$/);
  });

  it('formats a civil week without timezone drift', () => {
    expect(formatDashboardWeek('2026-09-28', '2026-10-04')).toBe(
      '28/09 – 04/10',
    );
  });
});
