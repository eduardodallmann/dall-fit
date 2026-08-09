import axios from 'axios';

import {
  AUTHENTICATION_REQUIRED_EVENT,
  clearCsrfToken,
  getCsrfToken,
} from '~/auth/csrf-token';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  const isMutation =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE';
  const csrfToken = getCsrfToken();
  if (isMutation && csrfToken !== undefined) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearCsrfToken();
      window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
    }

    return Promise.reject(
      error instanceof Error ? error : new Error('Request failed.'),
    );
  },
);
