import type { TermsAccess, TermsReference } from '@dall-fit/types';

import {
  getActiveSessionGeneration,
  getActiveSessionPersonId,
  isSessionGenerationActive,
  registerSessionResource,
} from '~/auth/session-lifecycle';

interface TermsPolicySnapshot {
  access: TermsAccess | null;
  hasAccepted: boolean;
  unavailable: boolean;
  localOnly: boolean;
  blocked: boolean;
}
export interface NativeTermsPort {
  read: (personId: string) => Promise<TermsAccess | null>;
  write: (access: TermsAccess, personId: string) => Promise<TermsAccess | null>;
  require: (reference: TermsReference, personId: string) => Promise<void>;
  resume: () => Promise<void>;
}
const initial: TermsPolicySnapshot = {
  hasAccepted: false,
  access: null,
  unavailable: false,
  localOnly: false,
  blocked: true,
};
let snapshot = initial;
let minimum: TermsReference | null = null;
let nativePort: NativeTermsPort | null = null;
const listeners = new Set<() => void>();
export const getTermsPolicy = () => snapshot;
export function subscribeTermsPolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function update(next: TermsPolicySnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}
export function parseTermsReference(
  value: unknown,
): TermsReference | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !/^[a-f\d]{24}$/i.test(value.id) ||
    !('publicationNumber' in value) ||
    typeof value.publicationNumber !== 'number' ||
    !Number.isSafeInteger(value.publicationNumber) ||
    value.publicationNumber < 1 ||
    !('contentHash' in value) ||
    typeof value.contentHash !== 'string' ||
    !/^[a-f\d]{64}$/.test(value.contentHash)
  )
    return undefined;
  return {
    id: value.id,
    publicationNumber: value.publicationNumber,
    contentHash: value.contentHash,
  };
}

export function configureNativeTerms(port: NativeTermsPort | null): void {
  nativePort = port;
}
export async function readNativeTerms(): Promise<TermsAccess | null> {
  const personId = getActiveSessionPersonId();
  return nativePort === null || personId === undefined
    ? null
    : nativePort.read(personId);
}
function assertActiveTermsSession(generation: number | undefined): void {
  if (!isSessionGenerationActive(generation))
    throw new DOMException('Session ended.', 'AbortError');
}
export async function applyTermsAccess(
  access: TermsAccess,
  generation = getActiveSessionGeneration(),
  localOnly = false,
): Promise<TermsAccess> {
  assertActiveTermsSession(generation);
  const personId = getActiveSessionPersonId();
  if (personId === undefined)
    throw new DOMException('Session ended.', 'AbortError');
  let current = access;
  if (!localOnly && nativePort !== null) {
    const persisted = await nativePort.write(access, personId);
    current =
      persisted?.state === 'accepted' && access.state !== 'accepted'
        ? access
        : (persisted ?? access);
  }
  assertActiveTermsSession(generation);
  if (
    current.current !== null &&
    (minimum === null ||
      current.current.publicationNumber >= minimum.publicationNumber)
  )
    minimum = current.current;
  if (
    minimum !== null &&
    (current.current === null ||
      current.current.publicationNumber < minimum.publicationNumber)
  )
    current = { state: 'required', current: minimum, acceptance: null };
  update({
    hasAccepted: snapshot.hasAccepted || current.state === 'accepted',
    access: current,
    unavailable: false,
    localOnly,
    blocked: current.state !== 'accepted',
  });
  if (current.state === 'accepted' && !localOnly && nativePort !== null) {
    try {
      await nativePort.resume();
    } catch {
      /* Confirmed proof is durable; a sync trigger may be retried independently. */
    }
  }
  assertActiveTermsSession(generation);
  return current;
}
export function requireTerms(reference?: TermsReference): void {
  if (
    reference !== undefined &&
    (minimum === null ||
      reference.publicationNumber >= minimum.publicationNumber)
  ) {
    minimum = reference;
    const personId = getActiveSessionPersonId();
    if (personId !== undefined)
      void nativePort?.require(reference, personId).catch(() => undefined);
  }
  update({
    hasAccepted: snapshot.hasAccepted,
    access:
      minimum === null
        ? null
        : { state: 'required', current: minimum, acceptance: null },
    unavailable: minimum === null,
    localOnly: false,
    blocked: true,
  });
}
export function termsUnavailable(): void {
  update({ ...snapshot, unavailable: true, blocked: true });
}
export function isTermsTransportBlocked(url: string | undefined): boolean {
  if (
    (!snapshot.blocked && !snapshot.localOnly) ||
    (snapshot.access === null && !snapshot.unavailable)
  )
    return false;
  const path = (url ?? '').split('?')[0];
  if (
    /^\/?(?:auth(?:\/|$)|terms(?:\/|$)|app-compatibility(?:\/|$)|realtime\/events)/.test(
      path,
    )
  )
    return false;
  if (/^\/?(?:admin(?:\/|$)|global\/training-plans(?:\/|$))/.test(path))
    return false;
  // Only a running authenticated generation participates in the legal gate.
  return getActiveSessionGeneration() !== undefined;
}
export function resetTermsPolicy(): void {
  minimum = null;
  update(initial);
}
registerSessionResource({ reset: resetTermsPolicy });
