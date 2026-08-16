import type { RealtimeResourceInvalidation } from '@dall-fit/types';

import { registerSessionResource } from '~/auth/session-lifecycle';

import { getClientInstanceId, resetClientInstanceId } from './client-instance';

type InvalidationListener = (event: RealtimeResourceInvalidation) => void;
type ReadyListener = () => void;

export class RealtimeClient {
  private eventSource?: EventSource;
  private hiddenTimer?: number;
  private readonly invalidationListeners = new Set<InvalidationListener>();
  private readonly readyListeners = new Set<ReadyListener>();
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.handleVisibility();
  }

  stop(): void {
    this.started = false;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.hiddenTimer !== undefined) window.clearTimeout(this.hiddenTimer);
    this.hiddenTimer = undefined;
    this.eventSource?.close();
    this.eventSource = undefined;
  }

  reset(): void {
    this.stop();
    this.invalidationListeners.clear();
    this.readyListeners.clear();
    resetClientInstanceId();
  }

  onInvalidation(listener: InvalidationListener): () => void {
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
  }

  onReady(listener: ReadyListener): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  private readonly handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (this.hiddenTimer !== undefined) return;
      this.hiddenTimer = window.setTimeout(() => {
        this.eventSource?.close();
        this.eventSource = undefined;
      }, 60_000);
      return;
    }
    if (this.hiddenTimer !== undefined) window.clearTimeout(this.hiddenTimer);
    this.hiddenTimer = undefined;
    if (this.started && this.eventSource === undefined) this.open();
  };

  private open(): void {
    if (!this.started || typeof EventSource === 'undefined') return;
    const baseUrl = String(import.meta.env.VITE_API_URL).replace(/\/$/, '');
    const url = new URL(`${baseUrl}/realtime/events`, window.location.origin);
    url.searchParams.set('clientInstanceId', getClientInstanceId());
    const source = new EventSource(url, { withCredentials: true });
    this.eventSource = source;
    source.addEventListener('realtime-ready', () => {
      for (const listener of this.readyListeners) listener();
    });
    source.addEventListener('resource-invalidated', (rawEvent) => {
      if (!(rawEvent instanceof MessageEvent)) return;
      try {
        const event = JSON.parse(
          String(rawEvent.data),
        ) as RealtimeResourceInvalidation;
        if (
          event.resource !== 'global-training-plan' ||
          typeof event.resourceId !== 'string' ||
          event.resourceId.length === 0 ||
          !['deleted', 'present'].includes(event.state) ||
          (event.state === 'present' &&
            (!Number.isInteger(event.version) || event.version < 0))
        )
          return;
        for (const listener of this.invalidationListeners) listener(event);
      } catch {
        // A malformed best-effort event is ignored; the next ready reconciliation repairs state.
      }
    });
  }
}

export const realtimeClient = new RealtimeClient();
registerSessionResource({ reset: () => realtimeClient.reset() });
