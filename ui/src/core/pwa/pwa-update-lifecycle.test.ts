import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkForServiceWorkerUpdate,
  isUpdateCheckDue,
  PWA_UPDATE_CHECK_INTERVAL_MS,
  resetPwaUpdateLifecycleForTests,
  runSingleDocumentActivation,
  waitForServiceWorkerActivation,
} from '~/core/pwa/pwa-update-lifecycle';

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
    scriptURL: `${window.location.origin}/sw.js`,
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
    scope: `${window.location.origin}/`,
    update: updateMock,
    updateMock,
    waiting: worker ?? null,
  } as unknown as FakeRegistration;
  updateMock.mockResolvedValue(registration);

  return registration;
}

function createServiceWorkerContainer() {
  return Object.assign(new EventTarget(), {
    controller: null as ServiceWorker | null,
  }) as ServiceWorkerContainer;
}

describe('PWA update lifecycle', () => {
  afterEach(() => {
    resetPwaUpdateLifecycleForTests();
    vi.useRealTimers();
  });

  it('uses the shared one-hour eligibility clock', () => {
    expect(isUpdateCheckDue(undefined, 10)).toBe(true);
    expect(isUpdateCheckDue(10, 10 + PWA_UPDATE_CHECK_INTERVAL_MS - 1)).toBe(
      false,
    );
    expect(isUpdateCheckDue(10, 10 + PWA_UPDATE_CHECK_INTERVAL_MS)).toBe(true);
  });

  it('revalidates the same-origin worker without HTTP cache before update', async () => {
    const registration = createRegistration();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 200 }));

    await expect(
      checkForServiceWorkerUpdate({
        fetcher,
        registration,
        swUrl: '/sw.js',
      }),
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith(
      new URL('/sw.js', window.location.href),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(registration.updateMock.mock.calls).toHaveLength(1);
  });

  it('does not update after a failed preflight or for a foreign worker URL', async () => {
    const registration = createRegistration();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 503 }));

    await expect(
      checkForServiceWorkerUpdate({
        fetcher,
        registration,
        swUrl: '/sw.js',
      }),
    ).resolves.toBe(false);
    await expect(
      checkForServiceWorkerUpdate({
        fetcher,
        registration,
        swUrl: 'https://foreign.example/sw.js',
      }),
    ).resolves.toBe(false);
    expect(registration.updateMock.mock.calls).toHaveLength(0);
  });

  it('waits for observable activation after the update command resolves', async () => {
    const worker = createWorker();
    const registration = createRegistration(worker);
    const sendUpdateCommand = vi.fn().mockResolvedValue(undefined);
    let resolved = false;
    const activation = waitForServiceWorkerActivation({
      registration,
      sendUpdateCommand,
      serviceWorkerContainer: createServiceWorkerContainer(),
      worker,
    }).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(sendUpdateCommand).toHaveBeenCalledOnce();
    expect(resolved).toBe(false);

    worker.setState('activated');
    await activation;
    expect(resolved).toBe(true);
  });

  it('terminates on redundant worker, timeout and abort', async () => {
    const redundant = createWorker('redundant');
    await expect(
      waitForServiceWorkerActivation({
        registration: createRegistration(redundant),
        sendUpdateCommand: vi.fn(),
        serviceWorkerContainer: createServiceWorkerContainer(),
        worker: redundant,
      }),
    ).rejects.toThrow('activation was not confirmed');

    vi.useFakeTimers();
    const timedOutWorker = createWorker();
    const timedOut = waitForServiceWorkerActivation({
      registration: createRegistration(timedOutWorker),
      sendUpdateCommand: vi.fn().mockResolvedValue(undefined),
      serviceWorkerContainer: createServiceWorkerContainer(),
      timeoutMs: 100,
      worker: timedOutWorker,
    });
    const timedOutExpectation = expect(timedOut).rejects.toThrow(
      'activation was not confirmed',
    );
    await vi.advanceTimersByTimeAsync(100);
    await timedOutExpectation;

    const abortController = new AbortController();
    const abortedWorker = createWorker();
    const aborted = waitForServiceWorkerActivation({
      registration: createRegistration(abortedWorker),
      sendUpdateCommand: vi.fn().mockResolvedValue(undefined),
      serviceWorkerContainer: createServiceWorkerContainer(),
      signal: abortController.signal,
      worker: abortedWorker,
    });
    abortController.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('converts a synchronous command failure into a terminal activation error', async () => {
    const worker = createWorker();

    await expect(
      waitForServiceWorkerActivation({
        registration: createRegistration(worker),
        sendUpdateCommand: () => {
          throw new Error('message channel unavailable');
        },
        serviceWorkerContainer: createServiceWorkerContainer(),
        worker,
      }),
    ).rejects.toThrow('activation was not confirmed');
  });

  it('shares one activation promise across concurrent triggers', async () => {
    let resolveOperation: () => void = () => undefined;
    const operation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveOperation = resolve;
        }),
    );

    const first = runSingleDocumentActivation(operation);
    const second = runSingleDocumentActivation(operation);

    expect(second).toBe(first);
    expect(operation).toHaveBeenCalledOnce();
    resolveOperation();
    await first;
  });
});
