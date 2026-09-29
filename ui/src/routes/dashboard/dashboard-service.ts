import type {
  AdminDashboard,
  AdminDashboardResponse,
  Dashboard,
  DashboardResponse,
} from '@dall-fit/types';

import { apiClient } from '~/core/http/api-client';

export type MockDashboardScenario =
  | 'admin'
  | 'admin-error'
  | 'empty'
  | 'personal'
  | 'personal-error'
  | 'session-running';

function config(
  scenario: MockDashboardScenario,
  timezone: string,
  signal?: AbortSignal,
) {
  const headers =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { 'x-dall-fit-mock-dashboard': scenario }
      : undefined;
  return { headers, params: { timezone }, signal };
}

export async function getDashboard(
  scenario: MockDashboardScenario,
  timezone: string,
  signal?: AbortSignal,
): Promise<Dashboard> {
  const response = await apiClient.get<DashboardResponse>(
    '/dashboard',
    config(scenario, timezone, signal),
  );
  return response.data.data;
}

export async function getAdminDashboard(
  scenario: MockDashboardScenario,
  timezone: string,
  signal?: AbortSignal,
): Promise<AdminDashboard> {
  const response = await apiClient.get<AdminDashboardResponse>(
    '/admin/dashboard',
    config(scenario, timezone, signal),
  );
  return response.data.data;
}
