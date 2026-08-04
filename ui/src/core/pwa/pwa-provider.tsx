import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useRegisterSW } from 'virtual:pwa-register/react';

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
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => undefined,
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

    installPromptRef.current = null;
    setIsInstalling(true);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
    } catch {
      // The application remains usable and falls back to manual instructions.
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

    setIsUpdating(true);

    try {
      await updateServiceWorker(true);
    } catch {
      setIsUpdating(false);
    }
  }, [isUpdating, updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
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
      update,
    }),
    [
      dismissUpdate,
      install,
      installationMode,
      isInstalling,
      isUpdating,
      needRefresh,
      update,
    ],
  );

  return <PwaContext value={value}>{children}</PwaContext>;
}
