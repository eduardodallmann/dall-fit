import type { PropsWithChildren } from 'react';

import { Toast } from '@heroui/react';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '~/context/query-client';
import { PwaUpdateNotice } from '~/core/components/pwa-update-notice';
import { PwaProvider } from '~/core/pwa/pwa-provider';
import { ThemeProvider } from '~/core/theme/theme-provider';
import {
  getPublicThemeState,
  type ThemeState,
} from '~/core/theme/theme-storage';

interface AppProvidersProps extends PropsWithChildren {
  initialTheme?: ThemeState;
}

export function AppProviders({
  children,
  initialTheme = getPublicThemeState(),
}: Readonly<AppProvidersProps>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialTheme={initialTheme}>
        <PwaProvider>
          {children}
          <PwaUpdateNotice />
          <Toast.Provider placement="bottom end" />
        </PwaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
