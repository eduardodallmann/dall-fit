import axios from 'axios';

import { revalidateAdminAccess } from '~/auth/admin-access-lifecycle';
import {
  clearCsrfToken,
  ensureConfiguredCsrfToken,
  getCsrfToken,
  refreshCsrfToken,
} from '~/auth/csrf-token';
import {
  getNativeAccessToken,
  getSessionChannel,
  handleNativeUnauthorized,
} from '~/auth/session-channel';
import { endSession, getActiveSessionSignal } from '~/auth/session-lifecycle';
import { getApiErrorCode } from '~/core/http/http-error';
import { getClientInstanceId } from '~/core/realtime/client-instance';
import {
  isTermsTransportBlocked,
  parseTermsReference,
  requireTerms,
} from '~/core/terms/policy';

export const DEFAULT_REQUEST_TIMEOUT = 15_000;
export const UPLOAD_REQUEST_TIMEOUT = 60_000;

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: DEFAULT_REQUEST_TIMEOUT,
  transitional: { clarifyTimeoutError: true },
  withCredentials: true,
});

apiClient.interceptors.request.use(async (config) => {
  if (isTermsTransportBlocked(config.url))
    throw new axios.CanceledError('Terms acceptance required.');
  const sessionChannel = getSessionChannel();
  if (sessionChannel === 'native') {
    config.withCredentials = false;
    const accessToken = await getNativeAccessToken();
    if (accessToken !== undefined && !config.headers.has('Authorization'))
      config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  const method = config.method?.toUpperCase();
  const isMutation =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE';
  const sessionSignal = getActiveSessionSignal();
  let csrfToken = getCsrfToken();
  if (
    sessionChannel === 'web' &&
    isMutation &&
    sessionSignal !== undefined &&
    csrfToken === undefined
  )
    csrfToken = await ensureConfiguredCsrfToken();
  if (sessionChannel === 'web' && isMutation && csrfToken !== undefined) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }
  if (isMutation)
    config.headers.set('X-Client-Instance-Id', getClientInstanceId());
  if (sessionSignal !== undefined) {
    config.signal =
      config.signal === undefined || config.signal === sessionSignal
        ? sessionSignal
        : AbortSignal.any([config.signal as AbortSignal, sessionSignal]);
  }

  return config;
});

function handleAuthorizationError(error: unknown): void {
  if (
    !axios.isAxiosError(error) ||
    axios.isCancel(error) ||
    error.config?.signal?.aborted
  )
    return;
  const status = error.response?.status;
  const code = getApiErrorCode(error);
  if (status === 401) {
    clearCsrfToken();
    const expiration =
      getSessionChannel() === 'native'
        ? handleNativeUnauthorized()
        : endSession('expired');
    expiration.catch(() => undefined);
  } else if (status === 403 && code === 'CSRF_VALIDATION_FAILED') {
    refreshCsrfToken().catch(() => undefined);
  } else if (status === 403 && code === 'ADMIN_ACCESS_REQUIRED') {
    revalidateAdminAccess().catch(() => undefined);
  } else if (status === 403 && code === 'TERMS_ACCEPTANCE_REQUIRED') {
    const body: unknown = error.response?.data;
    const details =
      typeof body === 'object' && body !== null && 'details' in body
        ? body.details
        : undefined;
    requireTerms(parseTermsReference(details));
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    handleAuthorizationError(error);

    return Promise.reject(
      error instanceof Error ? error : new Error('Request failed.'),
    );
  },
);
