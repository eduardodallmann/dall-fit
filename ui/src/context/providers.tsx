import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '~/context/query-client';

export function AppProviders({ children }: Readonly<PropsWithChildren>) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
