import type { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  clientInstanceId?: string;
  requestId: string;
}

export const CLIENT_INSTANCE_ID_HEADER = 'x-client-instance-id';

export const REQUEST_CONTEXT_STORAGE = Symbol('REQUEST_CONTEXT_STORAGE');

export type RequestContextStorage = AsyncLocalStorage<RequestContext>;
