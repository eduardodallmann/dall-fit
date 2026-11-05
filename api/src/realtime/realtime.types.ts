import type { RealtimeResourceInvalidation } from '@dall-fit/types';

export interface InternalRealtimeEvent {
  audience: 'admin';
  event: RealtimeResourceInvalidation;
  originClientInstanceId?: string;
}

export interface RealtimeConnection {
  personId: string;
  clientInstanceId: string;
  isAdmin: boolean;
}
