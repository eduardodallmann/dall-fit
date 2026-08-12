import axios from 'axios';

import { revalidateAdminAccess } from '~/auth/admin-access-lifecycle';
import {
  clearCsrfToken,
  ensureConfiguredCsrfToken,
  getCsrfToken,
  refreshCsrfToken,
} from '~/auth/csrf-token';
import { endSession, getActiveSessionSignal } from '~/auth/session-lifecycle';
import { getApiErrorCode } from '~/core/http/http-error';

export const DEFAULT_REQUEST_TIMEOUT = 15_000;
export const UPLOAD_REQUEST_TIMEOUT = 60_000;

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: DEFAULT_REQUEST_TIMEOUT,
  transitional: { clarifyTimeoutError: true },
  withCredentials: true,
});

apiClient.interceptors.request.use(async (config) => {
  const method = config.method?.toUpperCase();
  const isMutation =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE';
  const sessionSignal = getActiveSessionSignal();
  let csrfToken = getCsrfToken();
  if (isMutation && sessionSignal !== undefined && csrfToken === undefined)
    csrfToken = await ensureConfiguredCsrfToken();
  if (isMutation && csrfToken !== undefined) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }
  if (sessionSignal !== undefined) {
    config.signal =
      config.signal === undefined || config.signal === sessionSignal
        ? sessionSignal
        : AbortSignal.any([config.signal as AbortSignal, sessionSignal]);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const code = getApiErrorCode(error);
      if (status === 401) {
        clearCsrfToken();
        endSession('expired').catch(() => undefined);
      } else if (status === 403 && code === 'CSRF_VALIDATION_FAILED') {
        refreshCsrfToken().catch(() => undefined);
      } else if (status === 403 && code === 'ADMIN_ACCESS_REQUIRED') {
        revalidateAdminAccess().catch(() => undefined);
      }
    }

    return Promise.reject(
      error instanceof Error ? error : new Error('Request failed.'),
    );
  },
);
