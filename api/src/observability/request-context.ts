import type { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
}

export const REQUEST_CONTEXT_STORAGE = Symbol('REQUEST_CONTEXT_STORAGE');

export type RequestContextStorage = AsyncLocalStorage<RequestContext>;
