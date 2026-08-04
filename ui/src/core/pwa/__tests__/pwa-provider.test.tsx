import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaInstallAction } from '~/core/components/pwa-install-action';
import { usePwa } from '~/core/pwa/pwa-context';
import { PwaProvider } from '~/core/pwa/pwa-provider';

const pwaMocks = vi.hoisted(() => ({
  needRefresh: false,
  onRegisterError: undefined as (() => void) | undefined,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: { onRegisterError?: () => void }) => {
    pwaMocks.onRegisterError = options.onRegisterError;

    return {
      needRefresh: [pwaMocks.needRefresh, pwaMocks.setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: pwaMocks.updateServiceWorker,
    };
  },
}));

function PwaProbe() {
  const {
    dismissUpdate,
    install,
    installationMode,
    isInstalling,
    isUpdating,
    needRefresh,
    update,
  } = usePwa();

  return (
    <div>
      <span>{installationMode}</span>
      <span>{isInstalling ? 'installing' : 'idle-install'}</span>
      <span>{isUpdating ? 'updating' : 'idle-update'}</span>
      <span>{needRefresh ? 'refresh-needed' : 'current'}</span>
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
    pwaMocks.needRefresh = false;
    pwaMocks.onRegisterError = undefined;
    pwaMocks.setNeedRefresh.mockReset();
    pwaMocks.updateServiceWorker.mockReset().mockResolvedValue(undefined);
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

  it('updates only after confirmation and allows dismissing the notice state', async () => {
    const user = userEvent.setup();
    pwaMocks.needRefresh = true;
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    expect(screen.getByText('refresh-needed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'update' }));
    expect(pwaMocks.updateServiceWorker).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(pwaMocks.setNeedRefresh).toHaveBeenCalledWith(false);
  });

  it('recovers the update controls when service worker activation fails', async () => {
    const user = userEvent.setup();
    pwaMocks.needRefresh = true;
    pwaMocks.updateServiceWorker.mockRejectedValueOnce(
      new Error('activation failure'),
    );
    render(
      <PwaProvider>
        <PwaProbe />
      </PwaProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'update' }));

    await waitFor(() =>
      expect(screen.getByText('idle-update')).toBeInTheDocument(),
    );
  });
});
