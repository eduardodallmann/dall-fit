import { QueryClient } from '@tanstack/react-query';

import { queryRetryDelay, shouldRetryQuery } from '~/core/http/http-error';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      staleTime: 30_000,
    },
    mutations: { retry: false },
  },
});
