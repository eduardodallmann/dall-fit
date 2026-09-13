import type { PropsWithChildren } from 'react';

import { Toast } from '@heroui/react';
import { QueryClientProvider } from '@tanstack/react-query';

import type { NativeSessionCoordinator } from '~/auth/native-session';
import { NativeSessionContext } from '~/auth/native-session-context';
import { queryClient } from '~/context/query-client';
import { PwaUpdateNotice } from '~/core/components/pwa-update-notice';
import {
  PlatformContext,
  type PlatformSnapshot,
} from '~/core/platform/platform';
import { resolveApplicationPlatform } from '~/core/platform/platform-composition';
import { PwaProvider } from '~/core/pwa/pwa-provider';
import { ReloadSafetyProvider } from '~/core/reload-safety/reload-safety-provider';
import { ThemeProvider } from '~/core/theme/theme-provider';
import {
  getPublicThemeState,
  type ThemeState,
} from '~/core/theme/theme-storage';

interface AppProvidersProps extends PropsWithChildren {
  initialTheme?: ThemeState;
  nativeSession?: NativeSessionCoordinator | null;
  platform?: PlatformSnapshot;
}

export function AppProviders({
  children,
  initialTheme = getPublicThemeState(),
  nativeSession = null,
  platform = resolveApplicationPlatform(),
}: Readonly<AppProvidersProps>) {
  return (
    <PlatformContext value={platform}>
      <NativeSessionContext value={nativeSession}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider initialTheme={initialTheme}>
            <ReloadSafetyProvider>
              <PwaProvider>
                {children}
                <PwaUpdateNotice />
                <Toast.Provider placement="bottom end" />
              </PwaProvider>
            </ReloadSafetyProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </NativeSessionContext>
    </PlatformContext>
  );
}
