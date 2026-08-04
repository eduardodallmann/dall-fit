import type { PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '~/context/query-client';
import { PwaUpdateNotice } from '~/core/components/pwa-update-notice';
import { PwaProvider } from '~/core/pwa/pwa-provider';

export function AppProviders({ children }: Readonly<PropsWithChildren>) {
  return (
    <QueryClientProvider client={queryClient}>
      <PwaProvider>
        {children}
        <PwaUpdateNotice />
      </PwaProvider>
    </QueryClientProvider>
  );
}
