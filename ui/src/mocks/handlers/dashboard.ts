import { delay, http, HttpResponse } from 'msw';

import {
  createAdminDashboardFixture,
  createDashboardFixture,
} from '~/mocks/fixtures/dashboard';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

const apiBaseUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');
const attempts = new Map<string, number>();

export function resetDashboardScenarioStates(): void {
  attempts.clear();
}

function scenario(request: Request): string {
  return request.headers.get('x-dall-fit-mock-dashboard') ?? 'personal';
}

function error() {
  return HttpResponse.json(
    createMockApiError('SERVICE_UNAVAILABLE', 'Dashboard is unavailable.'),
    createMockResponseInit({ status: 503 }),
  );
}

function shouldFailInitialQuery(name: string, key: string): boolean {
  if (name !== key) return false;
  const count = attempts.get(key) ?? 0;
  attempts.set(key, count + 1);
  // TanStack Query retries one transient failure before exposing the error.
  return count < 2;
}

export const dashboardHandlers = [
  http.get(`${apiBaseUrl}/dashboard`, async ({ request }) => {
    const name = scenario(request);
    if (shouldFailInitialQuery(name, 'personal-error')) return error();
    if (name === 'empty') await delay(1_000);
    const state: 'empty' | 'personal' | 'session-running' =
      name === 'empty' || name === 'session-running' ? name : 'personal';
    return HttpResponse.json(
      { data: createDashboardFixture(state) },
      createMockResponseInit({
        headers: { 'Cache-Control': 'private, no-store' },
      }),
    );
  }),
  http.get(`${apiBaseUrl}/admin/dashboard`, ({ request }) => {
    const name = scenario(request);
    if (shouldFailInitialQuery(name, 'admin-error')) return error();
    return HttpResponse.json(
      { data: createAdminDashboardFixture() },
      createMockResponseInit({
        headers: { 'Cache-Control': 'private, no-store' },
      }),
    );
  }),
];
