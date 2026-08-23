export const PWA_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const PWA_ACTIVATION_TIMEOUT_MS = 15_000;

interface CheckForUpdateOptions {
  fetcher?: typeof window.fetch;
  registration: ServiceWorkerRegistration;
  signal?: AbortSignal;
  swUrl: string;
}

interface WaitForActivationOptions {
  registration: ServiceWorkerRegistration;
  sendUpdateCommand: () => Promise<void>;
  serviceWorkerContainer: ServiceWorkerContainer;
  signal?: AbortSignal;
  timeoutMs?: number;
  worker: ServiceWorker;
}

let activationInFlight: Promise<void> | undefined;
let reloadRequested = false;
let reloadDocument = () => window.location.reload();

export function isUpdateCheckDue(
  lastAttemptAt: number | undefined,
  now: number,
): boolean {
  return (
    lastAttemptAt === undefined ||
    now - lastAttemptAt >= PWA_UPDATE_CHECK_INTERVAL_MS
  );
}

export async function checkForServiceWorkerUpdate({
  fetcher = window.fetch.bind(window),
  registration,
  signal,
  swUrl,
}: CheckForUpdateOptions): Promise<boolean> {
  const workerUrl = new URL(swUrl, window.location.href);

  if (workerUrl.origin !== window.location.origin) return false;

  const response = await fetcher(workerUrl, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return false;

  await registration.update();

  return true;
}

function activationError(): Error {
  return new Error('Service worker activation was not confirmed.');
}

export async function waitForServiceWorkerActivation({
  registration,
  sendUpdateCommand,
  serviceWorkerContainer,
  signal,
  timeoutMs = PWA_ACTIVATION_TIMEOUT_MS,
  worker,
}: WaitForActivationOptions): Promise<void> {
  if (worker.state === 'activated' || registration.active === worker) return;
  if (worker.state === 'redundant') throw activationError();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const previousController = serviceWorkerContainer.controller;
    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', handleStateChange);
      serviceWorkerContainer.removeEventListener(
        'controllerchange',
        handleControllerChange,
      );
      signal?.removeEventListener('abort', handleAbort);
    };
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolve();
      else reject(error);
    };
    const isActivated = () =>
      worker.state === 'activated' ||
      registration.active === worker ||
      (serviceWorkerContainer.controller === worker &&
        serviceWorkerContainer.controller !== previousController);
    function handleStateChange() {
      if (isActivated()) settle();
      else if (worker.state === 'redundant') settle(activationError());
    }
    function handleControllerChange() {
      if (isActivated()) settle();
    }
    function handleAbort() {
      settle(new DOMException('Operation aborted.', 'AbortError'));
    }
    const timeout = window.setTimeout(
      () => settle(activationError()),
      timeoutMs,
    );

    worker.addEventListener('statechange', handleStateChange);
    serviceWorkerContainer.addEventListener(
      'controllerchange',
      handleControllerChange,
    );
    signal?.addEventListener('abort', handleAbort, { once: true });

    if (signal?.aborted === true) {
      handleAbort();
      return;
    }

    void Promise.resolve()
      .then(sendUpdateCommand)
      .then(() => {
        if (isActivated()) settle();
        else if (worker.state === 'redundant') settle(activationError());
      })
      .catch(() => settle(activationError()));
  });
}

export function runSingleDocumentActivation(
  operation: () => Promise<void>,
): Promise<void> {
  activationInFlight ??= operation().finally(() => {
    activationInFlight = undefined;
  });

  return activationInFlight;
}

export function reloadCurrentDocumentOnce(): void {
  if (reloadRequested) return;

  reloadRequested = true;
  reloadDocument();
}

export function resetPwaUpdateLifecycleForTests(): void {
  activationInFlight = undefined;
  reloadRequested = false;
  reloadDocument = () => window.location.reload();
}

export function setPwaDocumentReloadForTests(reload: () => void): void {
  reloadDocument = reload;
}
