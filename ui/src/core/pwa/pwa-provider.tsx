import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useRegisterSW } from 'virtual:pwa-register/react';

import { reportSystemFailure, trackUiEvent } from '~/core/analytics';
import {
  PwaContext,
  type PwaContextValue,
  type PwaInstallationMode,
} from '~/core/pwa/pwa-context';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

interface NavigatorWithStandalone extends Navigator {
  readonly standalone?: boolean;
}

function isStandalone(): boolean {
  const navigatorWithStandalone = navigator as NavigatorWithStandalone;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function PwaProvider({ children }: Readonly<PropsWithChildren>) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => reportSystemFailure('pwa_registration'),
  });

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;

      event.preventDefault();
      installPromptRef.current = promptEvent;
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => {
      installPromptRef.current = null;
      setInstallPrompt(null);
      setInstalled(true);
    };
    const handleDisplayModeChange = () => {
      if (isStandalone()) {
        handleInstalled();
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEvent = installPromptRef.current;

    if (promptEvent === null || isInstalling) {
      return;
    }

    trackUiEvent({
      control: 'pwa_install',
      eventName: 'ui_operation_started',
      operation: 'pwa_install',
      surface: 'pwa_install',
    });
    installPromptRef.current = null;
    setIsInstalling(true);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
      trackUiEvent({
        control: 'pwa_install',
        eventName: 'ui_operation_completed',
        operation: 'pwa_install',
        outcome: choice.outcome === 'accepted' ? 'success' : 'dismissed',
        surface: 'pwa_install',
      });
    } catch {
      // The application remains usable and falls back to manual instructions.
      trackUiEvent({
        control: 'pwa_install',
        eventName: 'ui_operation_completed',
        operation: 'pwa_install',
        outcome: 'error',
        surface: 'pwa_install',
      });
    } finally {
      setInstallPrompt((currentPrompt) =>
        currentPrompt === promptEvent ? null : currentPrompt,
      );
      setIsInstalling(false);
    }
  }, [isInstalling]);

  const update = useCallback(async () => {
    if (isUpdating) {
      return;
    }

    trackUiEvent({
      control: 'pwa_update',
      eventName: 'ui_operation_started',
      operation: 'pwa_update',
      surface: 'pwa_update',
    });
    setIsUpdating(true);
    setUpdateFailed(false);

    try {
      await updateServiceWorker(true);
      trackUiEvent({
        control: 'pwa_update',
        eventName: 'ui_operation_completed',
        operation: 'pwa_update',
        outcome: 'success',
        surface: 'pwa_update',
      });
    } catch {
      setUpdateFailed(true);
      trackUiEvent({
        control: 'pwa_update',
        eventName: 'ui_operation_completed',
        operation: 'pwa_update',
        outcome: 'error',
        surface: 'pwa_update',
      });
    } finally {
      setIsUpdating(false);
    }
  }, [isUpdating, updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    trackUiEvent({
      control: 'pwa_update_dismiss',
      eventName: 'ui_operation_started',
      operation: 'pwa_update',
      surface: 'pwa_update',
    });
    setNeedRefresh(false);
    trackUiEvent({
      control: 'pwa_update_dismiss',
      eventName: 'ui_operation_completed',
      operation: 'pwa_update',
      outcome: 'dismissed',
      surface: 'pwa_update',
    });
  }, [setNeedRefresh]);

  let installationMode: PwaInstallationMode = 'prompt';

  if (installed) {
    installationMode = 'installed';
  } else if (installPrompt === null) {
    installationMode = 'manual';
  }
  const value = useMemo<PwaContextValue>(
    () => ({
      dismissUpdate,
      install,
      installationMode,
      isInstalling,
      isUpdating,
      needRefresh,
      updateFailed,
      update,
    }),
    [
      dismissUpdate,
      install,
      installationMode,
      isInstalling,
      isUpdating,
      needRefresh,
      updateFailed,
      update,
    ],
  );

  return <PwaContext value={value}>{children}</PwaContext>;
}
