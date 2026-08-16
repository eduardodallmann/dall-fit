import type { RealtimeResourceInvalidation } from '@dall-fit/types';

export interface InternalRealtimeEvent {
  audience: 'admin';
  event: RealtimeResourceInvalidation;
  originClientInstanceId?: string;
}

export interface RealtimeConnection {
  clientInstanceId: string;
  isAdmin: boolean;
}
