import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateSession,
  configureSessionEndHandler,
  endSession,
  getActiveSessionGeneration,
  getActiveSessionSignal,
  isSessionGenerationActive,
  registerSessionResource,
  resetSessionLifecycleForTests,
} from '~/auth/session-lifecycle';

describe('session lifecycle', () => {
  afterEach(() => resetSessionLifecycleForTests());

  it('deduplicates teardown and aborts the active generation before cleanup', async () => {
    const reset = vi.fn();
    const handler = vi.fn(() => Promise.resolve());
    configureSessionEndHandler(handler);
    registerSessionResource({ reset });
    const generation = await activateSession('person-1', 'admin');
    const signal = getActiveSessionSignal();

    const first = endSession('expired');
    const second = endSession('expired');

    expect(first).toBe(second);
    expect(signal?.aborted).toBe(true);
    expect(getActiveSessionSignal()).toBe(signal);
    await first;
    expect(reset).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    expect(isSessionGenerationActive(generation)).toBe(false);
  });

  it('opens a fresh generation without inheriting the previous signal', async () => {
    configureSessionEndHandler(() => Promise.resolve());
    const first = await activateSession('person-1', 'admin');
    const firstSignal = getActiveSessionSignal();
    await endSession('logout');
    const second = await activateSession('person-2', 'authenticated');

    expect(second).toBeGreaterThan(first);
    expect(getActiveSessionGeneration()).toBe(second);
    expect(getActiveSessionSignal()).not.toBe(firstSignal);
    expect(firstSignal?.aborted).toBe(true);
  });

  it('tears down an old identity before opening the replacement generation', async () => {
    const handler = vi.fn(() => Promise.resolve());
    configureSessionEndHandler(handler);
    const first = await activateSession('person-1', 'admin');
    const firstSignal = getActiveSessionSignal();

    const second = await activateSession('person-2', 'admin');

    expect(second).toBeGreaterThan(first);
    expect(firstSignal?.aborted).toBe(true);
    expect(handler).toHaveBeenCalledWith('identity_changed', first);
  });

  it('ends the generation even when the terminal handler fails', async () => {
    configureSessionEndHandler(() => Promise.reject(new Error('navigation')));
    const generation = await activateSession('person-1', 'admin');

    await expect(endSession('logout')).rejects.toThrow('navigation');

    expect(isSessionGenerationActive(generation)).toBe(false);
  });
});
