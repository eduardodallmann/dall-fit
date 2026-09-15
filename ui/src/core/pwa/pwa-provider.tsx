import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useRegisterSW } from 'virtual:pwa-register/react';

import { reportSystemFailure, trackUiEvent } from '~/core/analytics';
import { isBrowserOnline, useConnectivity } from '~/core/connectivity';
import {
  PwaContext,
  type PwaContextValue,
  type PwaInstallationMode,
} from '~/core/pwa/pwa-context';
import {
  checkForServiceWorkerUpdate,
  isUpdateCheckDue,
  PWA_UPDATE_CHECK_INTERVAL_MS,
  reloadCurrentDocumentOnce,
  runSingleDocumentActivation,
  waitForServiceWorkerActivation,
} from '~/core/pwa/pwa-update-lifecycle';
import { useReloadSafety } from '~/core/reload-safety/reload-safety-context';

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

function isDocumentVisible(): boolean {
  return document.visibilityState === 'visible';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function PwaProvider({ children }: Readonly<PropsWithChildren>) {
  const online = useConnectivity();
  const previousOnlineRef = useRef(online);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const [pwaRegistered, setPwaRegistered] = useState(false);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined,
  );
  const swUrlRef = useRef<string | undefined>(undefined);
  const pendingWorkerRef = useRef<ServiceWorker | undefined>(undefined);
  const pendingUpdateRef = useRef(false);
  const deferredUpdateRef = useRef(false);
  const externalControlConfirmedRef = useRef(false);
  const controllerRef = useRef<ServiceWorker | null>(
    navigator.serviceWorker?.controller ?? null,
  );
  const lastCheckAtRef = useRef<number | undefined>(undefined);
  const checkInFlightRef = useRef<Promise<void> | undefined>(undefined);
  const checkAbortRef = useRef<AbortController | undefined>(undefined);
  const activationAbortRef = useRef<AbortController | undefined>(undefined);
  const mountedRef = useRef(true);
  const automaticFailureReportedRef = useRef(false);
  const retryInFlightRef = useRef(false);
  const updateServiceWorkerRef = useRef<() => Promise<void>>(() =>
    Promise.resolve(),
  );
  const applyPendingUpdateRef = useRef<
    (interactive?: boolean) => Promise<void>
  >(() => Promise.resolve());
  const checkForUpdateRef = useRef<(force?: boolean) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const { isBlocked } = useReloadSafety();
  const isBlockedRef = useRef(isBlocked);

  const markUpdatePending = useCallback((newOpportunity = false) => {
    if (!mountedRef.current) return;

    pendingUpdateRef.current = true;
    const waiting = registrationRef.current?.waiting;
    if (waiting !== null && waiting !== undefined)
      pendingWorkerRef.current = waiting;
    if (newOpportunity) deferredUpdateRef.current = false;

    queueMicrotask(() => {
      if (mountedRef.current)
        void applyPendingUpdateRef.current().catch(() => undefined);
    });
  }, []);

  const {
    needRefresh: [, setPluginNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh: () => markUpdatePending(),
    onNeedReload: () => {
      externalControlConfirmedRef.current = true;
      markUpdatePending();
    },
    onRegisteredSW: (swUrl, registration) => {
      if (!mountedRef.current) return;
      if (registration === undefined) {
        reportSystemFailure('pwa_registration');
        return;
      }

      registrationRef.current = registration;
      swUrlRef.current = swUrl;
      controllerRef.current = navigator.serviceWorker.controller;
      setPwaRegistered(true);
      if (registration.waiting !== null) markUpdatePending(true);
      else
        queueMicrotask(() => {
          if (mountedRef.current)
            void checkForUpdateRef.current(true).catch(() => undefined);
        });
    },
    onRegisterError: () => reportSystemFailure('pwa_registration'),
  });

  const handleUpdateFailure = useCallback((interactive: boolean) => {
    deferredUpdateRef.current = true;
    setUpdateFailed(true);
    if (interactive) {
      trackUiEvent({
        control: 'pwa_update',
        eventName: 'ui_operation_completed',
        operation: 'pwa_update',
        outcome: 'error',
        surface: 'pwa_update',
      });
    } else if (!automaticFailureReportedRef.current) {
      automaticFailureReportedRef.current = true;
      reportSystemFailure('pwa_update');
    }
  }, []);

  const applyPendingUpdate = useCallback(
    async (interactive = false) => {
      if (
        !pendingUpdateRef.current ||
        deferredUpdateRef.current ||
        registrationRef.current === undefined ||
        isBlockedRef.current ||
        !isDocumentVisible()
      )
        return;

      const operation = async () => {
        if (!mountedRef.current) return;

        setIsUpdating(true);

        try {
          const registration = registrationRef.current;
          const currentWaiting = registration?.waiting;
          if (currentWaiting !== null && currentWaiting !== undefined)
            pendingWorkerRef.current = currentWaiting;
          const worker = pendingWorkerRef.current;

          if (!externalControlConfirmedRef.current) {
            if (registration === undefined || worker === undefined)
              throw new Error('No waiting service worker is available.');

            activationAbortRef.current?.abort();
            const activationAbort = new AbortController();
            activationAbortRef.current = activationAbort;
            await waitForServiceWorkerActivation({
              registration,
              sendUpdateCommand: updateServiceWorkerRef.current,
              serviceWorkerContainer: navigator.serviceWorker,
              signal: activationAbort.signal,
              worker,
            });
          }

          if (!mountedRef.current) return;
          pendingUpdateRef.current = false;
          automaticFailureReportedRef.current = false;
          setPluginNeedRefresh(false);
          setUpdateFailed(false);

          if (isBlockedRef.current || !isDocumentVisible()) {
            pendingUpdateRef.current = true;
            externalControlConfirmedRef.current = true;
            return;
          }

          if (interactive) {
            trackUiEvent({
              control: 'pwa_update',
              eventName: 'ui_operation_completed',
              operation: 'pwa_update',
              outcome: 'success',
              surface: 'pwa_update',
            });
          }
          reloadCurrentDocumentOnce();
        } catch (error) {
          if (!mountedRef.current || isAbortError(error)) return;

          handleUpdateFailure(interactive);
        } finally {
          if (mountedRef.current) setIsUpdating(false);
        }
      };

      await runSingleDocumentActivation(operation);
    },
    [handleUpdateFailure, setPluginNeedRefresh],
  );

  const checkForUpdate = useCallback(
    async (force = false) => {
      if (checkInFlightRef.current !== undefined) {
        await checkInFlightRef.current;
        return;
      }

      const registration = registrationRef.current;
      const swUrl = swUrlRef.current;
      const now = Date.now();
      if (
        registration === undefined ||
        swUrl === undefined ||
        !isBrowserOnline() ||
        !isDocumentVisible() ||
        registration.installing !== null ||
        (!force && !isUpdateCheckDue(lastCheckAtRef.current, now))
      )
        return;

      lastCheckAtRef.current = now;
      checkAbortRef.current?.abort();
      const checkAbort = new AbortController();
      checkAbortRef.current = checkAbort;
      const operation = checkForServiceWorkerUpdate({
        registration,
        signal: checkAbort.signal,
        swUrl,
      })
        .then(() => {
          if (!mountedRef.current) return;
          if (registration.waiting !== null) markUpdatePending(true);
        })
        .catch(() => {
          // Discovery failures are transient and do not imply activation failure.
        })
        .finally(() => {
          if (checkInFlightRef.current === operation)
            checkInFlightRef.current = undefined;
        });
      checkInFlightRef.current = operation;
      await operation;
    },
    [markUpdatePending],
  );

  useLayoutEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    updateServiceWorkerRef.current = () => updateServiceWorker();
    applyPendingUpdateRef.current = applyPendingUpdate;
    checkForUpdateRef.current = checkForUpdate;
  }, [applyPendingUpdate, checkForUpdate, updateServiceWorker]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      checkAbortRef.current?.abort();
      activationAbortRef.current?.abort();
      registrationRef.current = undefined;
      swUrlRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!pwaRegistered) return;
    const serviceWorkerContainer = navigator.serviceWorker;

    const handleResume = () => {
      if (isDocumentVisible()) {
        void applyPendingUpdateRef.current().catch(() => undefined);
        void checkForUpdateRef.current().catch(() => undefined);
      }
    };
    const handleControllerChange = () => {
      const previousController = controllerRef.current;
      const currentController = serviceWorkerContainer.controller;
      controllerRef.current = currentController;
      if (
        previousController === null ||
        currentController === previousController
      )
        return;

      externalControlConfirmedRef.current = true;
      markUpdatePending();
    };
    const timer = window.setInterval(
      handleResume,
      PWA_UPDATE_CHECK_INTERVAL_MS,
    );

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    serviceWorkerContainer.addEventListener(
      'controllerchange',
      handleControllerChange,
    );

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      serviceWorkerContainer.removeEventListener(
        'controllerchange',
        handleControllerChange,
      );
    };
  }, [markUpdatePending, pwaRegistered]);

  useEffect(() => {
    const connectionRestored = !previousOnlineRef.current && online;
    previousOnlineRef.current = online;
    if (!pwaRegistered || !connectionRestored || !isDocumentVisible()) return;
    void applyPendingUpdateRef.current().catch(() => undefined);
    void checkForUpdateRef.current().catch(() => undefined);
  }, [online, pwaRegistered]);

  useEffect(() => {
    if (!isBlocked) void applyPendingUpdateRef.current().catch(() => undefined);
  }, [isBlocked]);

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
      if (isStandalone()) handleInstalled();
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

    if (promptEvent === null || isInstalling) return;

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

      if (choice.outcome === 'accepted') setInstalled(true);
      trackUiEvent({
        control: 'pwa_install',
        eventName: 'ui_operation_completed',
        operation: 'pwa_install',
        outcome: choice.outcome === 'accepted' ? 'success' : 'dismissed',
        surface: 'pwa_install',
      });
    } catch {
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
    if (
      isUpdating ||
      retryInFlightRef.current ||
      isBlockedRef.current ||
      !isDocumentVisible()
    )
      return;

    retryInFlightRef.current = true;
    trackUiEvent({
      control: 'pwa_update',
      eventName: 'ui_operation_started',
      operation: 'pwa_update',
      surface: 'pwa_update',
    });
    deferredUpdateRef.current = false;
    pendingUpdateRef.current = true;
    try {
      await applyPendingUpdateRef.current(true);
    } finally {
      retryInFlightRef.current = false;
    }
  }, [isUpdating]);

  const dismissUpdate = useCallback(() => {
    deferredUpdateRef.current = true;
    setUpdateFailed(false);
    setPluginNeedRefresh(false);
    trackUiEvent({
      action: 'dismiss_update',
      control: 'pwa_update_dismiss',
      eventName: 'ui_button_pressed',
      surface: 'pwa_update',
    });
  }, [setPluginNeedRefresh]);

  let installationMode: PwaInstallationMode = 'prompt';
  if (installed) installationMode = 'installed';
  else if (installPrompt === null) installationMode = 'manual';

  const value = useMemo<PwaContextValue>(
    () => ({
      dismissUpdate,
      install,
      installationMode,
      isInstalling,
      isUpdating,
      updateFailed,
      update,
    }),
    [
      dismissUpdate,
      install,
      installationMode,
      isInstalling,
      isUpdating,
      updateFailed,
      update,
    ],
  );

  return <PwaContext value={value}>{children}</PwaContext>;
}
