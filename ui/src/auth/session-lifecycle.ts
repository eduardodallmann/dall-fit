export type SessionEndReason = 'expired' | 'identity_changed' | 'logout';

export interface SessionResource {
  reset: () => Promise<void> | void;
}

interface ActiveSession {
  controller: AbortController;
  generation: number;
  mockAuth: string;
  personId: string;
  status: 'active' | 'ending';
}

type SessionEndHandler = (
  reason: SessionEndReason,
  generation: number | undefined,
) => Promise<void>;

let activeSession: ActiveSession | undefined;
let endHandler: SessionEndHandler | undefined;
let endPromise: Promise<void> | undefined;
let nextGeneration = 0;
const resources = new Set<SessionResource>();

export function configureSessionEndHandler(handler: SessionEndHandler): void {
  endHandler = handler;
}

export async function activateSession(
  personId: string,
  mockAuth: string,
): Promise<number> {
  if (
    activeSession?.status === 'active' &&
    activeSession.personId === personId &&
    activeSession.mockAuth === mockAuth
  )
    return activeSession.generation;

  if (activeSession !== undefined) await endSession('identity_changed');

  nextGeneration += 1;
  activeSession = {
    controller: new AbortController(),
    generation: nextGeneration,
    mockAuth,
    personId,
    status: 'active',
  };
  endPromise = undefined;
  return activeSession.generation;
}

export function getActiveSessionSignal(): AbortSignal | undefined {
  return activeSession?.controller.signal;
}

export function getActiveSessionGeneration(): number | undefined {
  return activeSession?.status === 'active'
    ? activeSession.generation
    : undefined;
}

export function getActiveSessionMockAuth(): string | undefined {
  return activeSession?.status === 'active'
    ? activeSession.mockAuth
    : undefined;
}

export function isSessionGenerationActive(
  generation: number | undefined,
): boolean {
  return (
    generation !== undefined &&
    activeSession?.status === 'active' &&
    activeSession.generation === generation
  );
}

export function registerSessionResource(resource: SessionResource): () => void {
  resources.add(resource);
  return () => resources.delete(resource);
}

export function endSession(reason: SessionEndReason): Promise<void> {
  if (endPromise !== undefined) return endPromise;

  const endingSession = activeSession;
  if (endingSession !== undefined) {
    endingSession.status = 'ending';
    endingSession.controller.abort();
  }
  const generation = endingSession?.generation;
  endPromise = (async () => {
    const resets = [...resources].map(async (resource) => resource.reset());
    await Promise.allSettled(resets);
    try {
      await endHandler?.(reason, generation);
    } finally {
      if (activeSession?.generation === generation) activeSession = undefined;
    }
  })().finally(() => {
    endPromise = undefined;
  });
  return endPromise;
}

export function resetSessionLifecycleForTests(): void {
  activeSession?.controller.abort();
  activeSession = undefined;
  endHandler = undefined;
  endPromise = undefined;
  nextGeneration = 0;
  resources.clear();
}
