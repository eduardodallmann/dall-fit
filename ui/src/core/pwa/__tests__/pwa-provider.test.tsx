import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaInstallAction } from '~/core/components/pwa-install-action';
import { usePwa } from '~/core/pwa/pwa-context';
import { PwaProvider } from '~/core/pwa/pwa-provider';
import {
  resetPwaUpdateLifecycleForTests,
  setPwaDocumentReloadForTests,
} from '~/core/pwa/pwa-update-lifecycle';
import { ReloadBlocker } from '~/core/reload-safety/reload-blocker';
import { ReloadSafetyProvider } from '~/core/reload-safety/reload-safety-provider';

interface RegisterOptions {
  onNeedRefresh?: () => void;
  onNeedReload?: () => void;
  onRegisteredSW?: (
    swUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
  onRegisterError?: () => void;
}

const pwaMocks = vi.hoisted(() => ({
  needRefresh: false,
  onNeedRefresh: undefined as (() => void) | undefined,
  onNeedReload: undefined as (() => void) | undefined,
  onRegisteredSW: undefined as RegisterOptions['onRegisteredSW'],
  onRegisterError: undefined as (() => void) | undefined,
  reloadCurrentDocumentOnce: vi.fn(),
  reportSystemFailure: vi.fn(),
  setNeedRefresh: vi.fn(),
  trackUiEvent: vi.fn(),
  updateServiceWorker: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  reportSystemFailure: pwaMocks.reportSystemFailure,
  trackUiEvent: pwaMocks.trackUiEvent,
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: RegisterOptions) => {
    pwaMocks.onNeedRefresh = options.onNeedRefresh;
    pwaMocks.onNeedReload = options.onNeedReload;
    pwaMocks.onRegisteredSW = options.onRegisteredSW;
    pwaMocks.onRegisterError = options.onRegisterError;

    return {
      needRefresh: [pwaMocks.needRefresh, pwaMocks.setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: pwaMocks.updateServiceWorker,
    };
  },
}));

interface FakeWorker extends ServiceWorker {
  setState: (state: ServiceWorkerState) => void;
}

interface FakeRegistration extends ServiceWorkerRegistration {
  updateMock: ReturnType<typeof vi.fn>;
}

function createWorker(initialState: ServiceWorkerState = 'installed') {
  const target = new EventTarget();
  let state = initialState;
  const worker = Object.assign(target, {
    onerror: null,
    onstatechange: null,
    postMessage: vi.fn(),
    scriptURL: 'https://dall.fit/sw.js',
    setState(nextState: ServiceWorkerState) {
      state = nextState;
      target.dispatchEvent(new Event('statechange'));
    },
  });
  Object.defineProperty(worker, 'state', { get: () => state });

  return worker as unknown as FakeWorker;
}

function createRegistration(worker?: ServiceWorker) {
  const updateMock = vi.fn<() => Promise<ServiceWorkerRegistration>>();
  const registration = {
    active: null,
    installing: null,
    navigationPreload: {},
    onupdatefound: null,
    pushManager: {},
    scope: 'https://dall.fit/',
    showNotification: vi.fn(),
    sync: {},
    unregister: vi.fn(),
    update: updateMock,
    updateMock,
    updateViaCache: 'imports',
    waiting: worker ?? null,
  } as unknown as FakeRegistration;
  updateMock.mockResolvedValue(registration);

  return registration;
}

function PwaProbe() {
  const {
    dismissUpdate,
    install,
    installationMode,
    isInstalling,
    isUpdating,
    updateFailed,
    update,
  } = usePwa();

  return (
    <div>
      <span>{installationMode}</span>
      <span>{isInstalling ? 'installing' : 'idle-install'}</span>
      <span>{isUpdating ? 'updating' : 'idle-update'}</span>
      <span>{updateFailed ? 'update-failed' : 'update-ready'}</span>
      <button onClick={() => void install()} type="button">
        install
      </button>
      <button onClick={() => void update()} type="button">
        update
      </button>
      <button onClick={dismissUpdate} type="button">
        dismiss
      </button>
    </div>
  );
}

function createInstallPrompt(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);

  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });

  return { event, prompt };
}

function createPendingInstallPrompt() {
  let rejectChoice: (reason?: unknown) => void = () => undefined;
  let resolveChoice: (value: {
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }) => void = () => undefined;
  const userChoice = new Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>((resolve, reject) => {
    rejectChoice = reject;
    resolveChoice = resolve;
  });
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);

  Object.assign(event, { prompt, userChoice });

  return { event, prompt, rejectChoice, resolveChoice, userChoice };
}

describe('PwaProvider', () => {
  beforeEach(() => {
    resetPwaUpdateLifecycleForTests();
    pwaMocks.needRefresh = false;
    pwaMocks.onNeedRefresh = undefined;
    pwaMocks.onNeedReload = undefined;
    pwaMocks.onRegisteredSW = undefined;
    pwaMocks.onRegisterError = undefined;
    pwaMocks.reloadCurrentDocumentOnce.mockReset();
    setPwaDocumentReloadForTests(pwaMocks.reloadCurrentDocumentOnce);
    pwaMocks.reportSystemFailure.mockReset();
    pwaMocks.setNeedRefresh.mockReset();
    pwaMocks.trackUiEvent.mockReset();
    pwaMocks.updateServiceWorker.mockReset().mockResolvedValue(undefined);
    const serviceWorkerContainer = Object.assign(new EventTarget(), {
      controller: null as ServiceWorker | null,
      getRegistration: vi.fn(),
      getRegistrations: vi.fn(),
      ready: Promise.resolve(undefined),
      register: vi.fn(),
      startMessages: vi.fn(),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorkerContainer,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 200 })),
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'standalone');
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'onLine');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts with manual instructions when the browser has no native prompt', () => {
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(() => pwaMocks.onRegisterError?.()).not.toThrow();
    expect(pwaMocks.reportSystemFailure).toHaveBeenCalledWith(
      'pwa_registration',
    );
  });

  it('offers and consumes the native prompt only once when accepted', async () => {
    const user = userEvent.setup();
    const { event, prompt } = createInstallPrompt('accepted');
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('prompt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'install' }));

    await waitFor(() =>
      expect(screen.getByText('installed')).toBeInTheDocument(),
    );
    expect(prompt).toHaveBeenCalledOnce();
    expect(pwaMocks.trackUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_started',
        operation: 'pwa_install',
      }),
    );
    expect(pwaMocks.trackUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_completed',
        operation: 'pwa_install',
        outcome: 'success',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'install' }));
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('falls back to manual instructions after dismissal or prompt failure', async () => {
    const user = userEvent.setup();
    const dismissed = createInstallPrompt('dismissed');
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(dismissed.event);
    });
    await user.click(screen.getByRole('button', { name: 'install' }));
    await waitFor(() => expect(screen.getByText('manual')).toBeInTheDocument());

    const failed = createInstallPrompt('accepted');
    failed.prompt.mockRejectedValueOnce(new Error('browser failure'));
    void act(() => {
      window.dispatchEvent(failed.event);
    });
    await user.click(screen.getByRole('button', { name: 'install' }));

    await waitFor(() =>
      expect(screen.getByText('idle-install')).toBeInTheDocument(),
    );
    expect(screen.getByText('manual')).toBeInTheDocument();
  });

  it('keeps the native installation action visible until dismissal resolves', async () => {
    const user = userEvent.setup();
    const pending = createPendingInstallPrompt();
    render(
      <PwaProvider>
        <PwaInstallAction />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(pending.event);
    });
    await user.click(
      screen.getByRole('button', { name: 'Instalar aplicativo' }),
    );

    expect(pending.prompt).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Instalar aplicativo' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByRole('button', { name: 'Como instalar' }),
    ).not.toBeInTheDocument();

    await act(async () => {
      pending.resolveChoice({ outcome: 'dismissed', platform: 'web' });
      await pending.userChoice;
    });

    expect(
      screen.getByRole('button', { name: 'Como instalar' }),
    ).toBeInTheDocument();
  });

  it('keeps appinstalled authoritative over a late dismissed choice', async () => {
    const user = userEvent.setup();
    const pending = createPendingInstallPrompt();
    render(
      <PwaProvider>
        <PwaInstallAction />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(pending.event);
    });
    await user.click(
      screen.getByRole('button', { name: 'Instalar aplicativo' }),
    );
    void act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(
      screen.queryByRole('region', { name: 'Instalação do aplicativo' }),
    ).not.toBeInTheDocument();

    await act(async () => {
      pending.resolveChoice({ outcome: 'dismissed', platform: 'web' });
      await pending.userChoice;
    });

    expect(
      screen.queryByRole('region', { name: 'Instalação do aplicativo' }),
    ).not.toBeInTheDocument();
  });

  it('falls back after userChoice rejects', async () => {
    const user = userEvent.setup();
    const pending = createPendingInstallPrompt();
    render(
      <PwaProvider>
        <PwaInstallAction />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(pending.event);
    });
    await user.click(
      screen.getByRole('button', { name: 'Instalar aplicativo' }),
    );

    await act(async () => {
      pending.rejectChoice(new Error('choice failure'));

      try {
        await pending.userChoice;
      } catch {
        // The provider converts this browser failure into the manual fallback.
      }
    });

    expect(
      screen.getByRole('button', { name: 'Como instalar' }),
    ).toBeInTheDocument();
  });

  it('preserves a newer prompt when an earlier choice finishes', async () => {
    const user = userEvent.setup();
    const earlier = createPendingInstallPrompt();
    const newer = createPendingInstallPrompt();
    render(
      <PwaProvider>
        <PwaInstallAction />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(earlier.event);
    });
    await user.click(
      screen.getByRole('button', { name: 'Instalar aplicativo' }),
    );
    void act(() => {
      window.dispatchEvent(newer.event);
    });

    await act(async () => {
      earlier.resolveChoice({ outcome: 'dismissed', platform: 'web' });
      await earlier.userChoice;
    });

    await user.click(
      screen.getByRole('button', { name: 'Instalar aplicativo' }),
    );
    expect(earlier.prompt).toHaveBeenCalledOnce();
    expect(newer.prompt).toHaveBeenCalledOnce();

    await act(async () => {
      newer.resolveChoice({ outcome: 'dismissed', platform: 'web' });
      await newer.userChoice;
    });
  });

  it('hides installation actions in standalone mode and after appinstalled', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    const { unmount } = render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    expect(screen.getByText('installed')).toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.getByText('installed')).toBeInTheDocument();
  });

  it('recognizes the standalone mode exposed by iOS', () => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true,
    });

    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    expect(screen.getByText('installed')).toBeInTheDocument();
  });

  it('shares a single consumed prompt between both mounted menu actions', async () => {
    const user = userEvent.setup();
    const pending = createPendingInstallPrompt();
    render(
      <PwaProvider>
        <PwaInstallAction />
        <PwaInstallAction />
      </PwaProvider>,
    );

    void act(() => {
      window.dispatchEvent(pending.event);
    });
    expect(
      screen.getAllByRole('button', { name: 'Instalar aplicativo' }),
    ).toHaveLength(2);

    await user.click(
      screen.getAllByRole('button', { name: 'Instalar aplicativo' })[0],
    );

    expect(
      screen.getAllByRole('button', { name: 'Instalar aplicativo' }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'Instalar aplicativo' })[1],
    ).toHaveAttribute('aria-disabled', 'true');
    expect(pending.prompt).toHaveBeenCalledOnce();

    await act(async () => {
      pending.resolveChoice({ outcome: 'accepted', platform: 'web' });
      await pending.userChoice;
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Instalar aplicativo' }),
      ).not.toBeInTheDocument(),
    );
    expect(pending.prompt).toHaveBeenCalledOnce();
  });

  it('activates a waiting worker silently and reloads only after confirmation', async () => {
    const worker = createWorker();
    const registration = createRegistration(worker);
    pwaMocks.updateServiceWorker.mockImplementationOnce(() => {
      worker.setState('activated');
      return Promise.resolve();
    });
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    act(() => pwaMocks.onRegisteredSW?.('/sw.js', registration));

    await waitFor(() =>
      expect(pwaMocks.reloadCurrentDocumentOnce).toHaveBeenCalledOnce(),
    );
    expect(pwaMocks.updateServiceWorker).toHaveBeenCalledWith();
    expect(screen.getByText('update-ready')).toBeInTheDocument();
    expect(pwaMocks.trackUiEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'pwa_update' }),
    );
  });

  it('does not treat the resolved update command as activation success', async () => {
    const worker = createWorker();
    const registration = createRegistration(worker);
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    act(() => pwaMocks.onRegisteredSW?.('/sw.js', registration));

    await waitFor(() =>
      expect(pwaMocks.updateServiceWorker).toHaveBeenCalledOnce(),
    );
    expect(pwaMocks.reloadCurrentDocumentOnce).not.toHaveBeenCalled();

    act(() => worker.setState('activated'));

    await waitFor(() =>
      expect(pwaMocks.reloadCurrentDocumentOnce).toHaveBeenCalledOnce(),
    );
  });

  it('checks at registration, deduplicates resumes and checks again after one hour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00Z'));
    const registration = createRegistration();
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    act(() => {
      pwaMocks.onRegisteredSW?.('/sw.js', registration);
      window.dispatchEvent(new Event('focus'));
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(registration.updateMock.mock.calls).toHaveLength(1);

    void act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(registration.updateMock.mock.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(registration.updateMock.mock.calls).toHaveLength(2);
  });

  it('postpones discovery while offline and checks on the eligible online event', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const registration = createRegistration();
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    act(() => pwaMocks.onRegisteredSW?.('/sw.js', registration));
    await act(async () => Promise.resolve());
    expect(fetch).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    void act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() =>
      expect(registration.updateMock.mock.calls).toHaveLength(1),
    );
  });

  it('keeps a waiting update silent until the last reload blocker is removed', async () => {
    const worker = createWorker();
    const registration = createRegistration(worker);
    const queryClient = new QueryClient();
    pwaMocks.updateServiceWorker.mockImplementationOnce(() => {
      worker.setState('activated');
      return Promise.resolve();
    });
    const renderTree = (blocked: boolean) => (
      <QueryClientProvider client={queryClient}>
        <ReloadSafetyProvider>
          <ReloadBlocker active={blocked} />
          <PwaProvider>
            <PwaProbe />
          </PwaProvider>
        </ReloadSafetyProvider>
      </QueryClientProvider>
    );
    const view = render(renderTree(true));

    act(() => pwaMocks.onRegisteredSW?.('/sw.js', registration));
    await act(async () => Promise.resolve());
    expect(registration.updateMock.mock.calls).toHaveLength(0);
    expect(pwaMocks.updateServiceWorker).not.toHaveBeenCalled();
    expect(pwaMocks.reloadCurrentDocumentOnce).not.toHaveBeenCalled();
    expect(screen.getByText('update-ready')).toBeInTheDocument();

    view.rerender(renderTree(false));

    await waitFor(() =>
      expect(pwaMocks.reloadCurrentDocumentOnce).toHaveBeenCalledOnce(),
    );
  });

  it('shows terminal failure and retries from the real waiting worker', async () => {
    const user = userEvent.setup();
    const worker = createWorker();
    const registration = createRegistration(worker);
    pwaMocks.updateServiceWorker.mockRejectedValueOnce(
      new Error('activation failure'),
    );
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    act(() => pwaMocks.onRegisteredSW?.('/sw.js', registration));

    await waitFor(() =>
      expect(screen.getByText('update-failed')).toBeInTheDocument(),
    );
    expect(pwaMocks.reportSystemFailure).toHaveBeenCalledWith('pwa_update');
    expect(pwaMocks.reloadCurrentDocumentOnce).not.toHaveBeenCalled();
    pwaMocks.updateServiceWorker.mockImplementationOnce(() => {
      worker.setState('activated');
      return Promise.resolve();
    });

    await user.click(screen.getByRole('button', { name: 'update' }));

    await waitFor(() =>
      expect(pwaMocks.reloadCurrentDocumentOnce).toHaveBeenCalledOnce(),
    );
    expect(pwaMocks.trackUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_completed',
        operation: 'pwa_update',
        outcome: 'success',
      }),
    );
    expect(pwaMocks.updateServiceWorker).toHaveBeenCalledTimes(2);
  });

  it('defers the current failure when the person chooses to continue', async () => {
    const user = userEvent.setup();
    const worker = createWorker();
    const registration = createRegistration(worker);
    pwaMocks.updateServiceWorker.mockRejectedValueOnce(new Error('failure'));
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    act(() => pwaMocks.onRegisteredSW?.('/sw.js', registration));
    await waitFor(() =>
      expect(screen.getByText('update-failed')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'dismiss' }));

    expect(screen.getByText('update-ready')).toBeInTheDocument();
    expect(pwaMocks.trackUiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dismiss_update',
        eventName: 'ui_button_pressed',
      }),
    );
  });
});
