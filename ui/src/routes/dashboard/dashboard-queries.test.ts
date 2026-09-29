import { describe, expect, it } from 'vitest';

import {
  adminDashboardQueryOptions,
  dashboardKeys,
  dashboardQueryOptions,
} from '~/routes/dashboard/dashboard-queries';

describe('dashboard query options', () => {
  it('separates personal and administrative caches by scenario and timezone', () => {
    expect(dashboardKeys.personal('personal', 'UTC')).toEqual([
      'dashboard',
      'personal',
      'personal',
      'UTC',
    ]);
    expect(dashboardKeys.admin('admin', 'America/Sao_Paulo')).toEqual([
      'dashboard',
      'admin',
      'admin',
      'America/Sao_Paulo',
    ]);
  });

  it.each([
    dashboardQueryOptions('personal', 'UTC'),
    adminDashboardQueryOptions('admin', 'UTC'),
  ])('uses the dashboard freshness and reconnect policy', (options) => {
    expect(options).toMatchObject({
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      staleTime: 60_000,
    });
  });
});
