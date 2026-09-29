import { queryOptions } from '@tanstack/react-query';

import {
  getAdminDashboard,
  getDashboard,
  type MockDashboardScenario,
} from '~/routes/dashboard/dashboard-service';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  admin: (scenario: MockDashboardScenario, timezone: string) =>
    [...dashboardKeys.all, 'admin', scenario, timezone] as const,
  personal: (scenario: MockDashboardScenario, timezone: string) =>
    [...dashboardKeys.all, 'personal', scenario, timezone] as const,
};

const dashboardQueryDefaults = {
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
  staleTime: 60_000,
} as const;

export function dashboardQueryOptions(
  scenario: MockDashboardScenario,
  timezone: string,
) {
  return queryOptions({
    ...dashboardQueryDefaults,
    queryFn: ({ signal }) => getDashboard(scenario, timezone, signal),
    queryKey: dashboardKeys.personal(scenario, timezone),
  });
}

export function adminDashboardQueryOptions(
  scenario: MockDashboardScenario,
  timezone: string,
) {
  return queryOptions({
    ...dashboardQueryDefaults,
    queryFn: ({ signal }) => getAdminDashboard(scenario, timezone, signal),
    queryKey: dashboardKeys.admin(scenario, timezone),
  });
}
