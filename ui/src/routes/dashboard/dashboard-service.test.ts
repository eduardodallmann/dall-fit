import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAdminDashboard,
  getDashboard,
} from '~/routes/dashboard/dashboard-service';

const { apiGetMock } = vi.hoisted(() => ({ apiGetMock: vi.fn() }));

vi.mock('~/core/http/api-client', () => ({
  apiClient: { get: apiGetMock },
}));

describe('dashboard service', () => {
  beforeEach(() => apiGetMock.mockReset());

  it('sends timezone, mock scenario and AbortSignal to the personal endpoint', async () => {
    const signal = new AbortController().signal;
    apiGetMock.mockResolvedValue({ data: { data: { id: 'x' } } });

    await getDashboard('session-running', 'America/Sao_Paulo', signal);

    expect(apiGetMock).toHaveBeenCalledWith('/dashboard', {
      headers: { 'x-dall-fit-mock-dashboard': 'session-running' },
      params: { timezone: 'America/Sao_Paulo' },
      signal,
    });
  });

  it('uses the separate administrative endpoint', async () => {
    apiGetMock.mockResolvedValue({ data: { data: { id: 'x' } } });

    await getAdminDashboard('admin', 'UTC');

    expect(apiGetMock).toHaveBeenCalledWith(
      '/admin/dashboard',
      expect.objectContaining({ params: { timezone: 'UTC' } }),
    );
  });
});
