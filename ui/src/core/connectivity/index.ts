import { useSyncExternalStore } from 'react';

const subscribers = new Set<() => void>();
let listening = false;

function notifySubscribers(): void {
  for (const subscriber of subscribers) subscriber();
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('online', notifySubscribers);
  window.addEventListener('offline', notifySubscribers);
  listening = true;
}

function stopListening(): void {
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('online', notifySubscribers);
  window.removeEventListener('offline', notifySubscribers);
  listening = false;
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function subscribeToConnectivity(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  startListening();

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) stopListening();
  };
}

export function refreshConnectivity(): void {
  notifySubscribers();
}

export function useConnectivity(): boolean {
  return useSyncExternalStore(
    subscribeToConnectivity,
    isBrowserOnline,
    () => true,
  );
}
