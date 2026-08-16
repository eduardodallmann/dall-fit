import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeClient } from './realtime-client';

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly withCredentials: boolean;
  close = vi.fn();

  constructor(url: string | URL, options?: EventSourceInit) {
    super();
    this.url = String(url);
    this.withCredentials = options?.withCredentials === true;
    FakeEventSource.instances.push(this);
  }
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('opens one credentialed stream and accepts only valid named events', () => {
    const client = new RealtimeClient();
    const ready = vi.fn();
    const invalidated = vi.fn();
    client.onReady(ready);
    client.onInvalidation(invalidated);

    client.start();
    client.start();

    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.instances[0];
    expect(source.withCredentials).toBe(true);
    expect(source.url).toContain('/realtime/events?clientInstanceId=');
    source.dispatchEvent(new Event('realtime-ready'));
    source.dispatchEvent(
      new MessageEvent('resource-invalidated', {
        data: JSON.stringify({
          resource: 'global-training-plan',
          resourceId: 'plan-a',
          state: 'present',
          version: 3,
        }),
      }),
    );
    source.dispatchEvent(
      new MessageEvent('resource-invalidated', {
        data: JSON.stringify({
          resource: 'global-training-plan',
          resourceId: 'plan-a',
          state: 'present',
          version: -1,
        }),
      }),
    );

    expect(ready).toHaveBeenCalledOnce();
    expect(invalidated).toHaveBeenCalledOnce();
    client.stop();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('closes after sixty hidden seconds and reconciles through a new ready', () => {
    vi.useFakeTimers();
    const client = new RealtimeClient();
    const ready = vi.fn();
    client.onReady(ready);
    client.start();
    const initialSource = FakeEventSource.instances[0];

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60_000);
    expect(initialSource.close).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.instances[1].dispatchEvent(new Event('realtime-ready'));
    expect(ready).toHaveBeenCalledOnce();
    client.stop();
  });

  it('removes callbacks when the authenticated session is reset', () => {
    const client = new RealtimeClient();
    const invalidated = vi.fn();
    client.onInvalidation(invalidated);
    client.start();
    const source = FakeEventSource.instances[0];

    client.reset();
    source.dispatchEvent(
      new MessageEvent('resource-invalidated', {
        data: JSON.stringify({
          resource: 'global-training-plan',
          resourceId: 'plan-a',
          state: 'deleted',
        }),
      }),
    );

    expect(source.close).toHaveBeenCalledOnce();
    expect(invalidated).not.toHaveBeenCalled();
  });
});
