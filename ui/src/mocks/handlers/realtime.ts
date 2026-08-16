import { sse, type ServerSentEventMessage } from 'msw';

import type {
  RealtimeResourceInvalidation,
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutDetails,
} from '@dall-fit/types';

interface RealtimeEventMap {
  [key: string]: unknown;
  [key: number]: never;
  [key: symbol]: never;
  heartbeat: Record<string, never>;
  'realtime-ready': Record<string, never>;
  'resource-invalidated': RealtimeResourceInvalidation;
}

interface MockRealtimeClient {
  clientInstanceId: string;
  send: (message: ServerSentEventMessage<RealtimeEventMap>) => void;
}

const clients = new Set<MockRealtimeClient>();

interface MockRealtimeEnvelope {
  event: RealtimeResourceInvalidation;
  origin: string | null;
  scenario?: string;
  state?: {
    detail: TrainingPlanDetails;
    nextExerciseNumber: number;
    plans: TrainingPlanSummary[];
    workout: TrainingPlanWorkoutDetails;
    workoutReadCount: number;
  };
}

const replicationListeners = new Set<
  (envelope: MockRealtimeEnvelope) => void
>();

export function registerMockRealtimeReplication(
  listener: (envelope: MockRealtimeEnvelope) => void,
): void {
  replicationListeners.add(listener);
}

const broadcast =
  typeof EventSource === 'undefined'
    ? undefined
    : new BroadcastChannel('dall-fit-msw-realtime');

function deliverMockRealtimeInvalidation(envelope: MockRealtimeEnvelope): void {
  for (const listener of replicationListeners) listener(envelope);
  for (const client of clients) {
    if (client.clientInstanceId !== envelope.origin)
      client.send({ data: envelope.event, event: 'resource-invalidated' });
  }
}

broadcast?.addEventListener('message', (message: MessageEvent<unknown>) => {
  const envelope = message.data as MockRealtimeEnvelope;
  if (envelope?.event?.resource === 'global-training-plan')
    deliverMockRealtimeInvalidation(envelope);
});

export function publishMockRealtimeInvalidation(
  request: Request,
  event: RealtimeResourceInvalidation,
  replication?: Pick<MockRealtimeEnvelope, 'scenario' | 'state'>,
): void {
  const envelope = {
    event,
    origin: request.headers.get('x-client-instance-id'),
    ...replication,
  };
  deliverMockRealtimeInvalidation(envelope);
  broadcast?.postMessage(envelope);
}

export const realtimeHandlers =
  typeof EventSource === 'undefined'
    ? []
    : [
        sse<RealtimeEventMap>('*/realtime/events', ({ client, request }) => {
          const clientInstanceId = new URL(request.url).searchParams.get(
            'clientInstanceId',
          );
          if (clientInstanceId === null) {
            client.close();
            return;
          }
          const mockClient: MockRealtimeClient = {
            clientInstanceId,
            send: (message) => client.send(message),
          };
          clients.add(mockClient);
          const heartbeat = globalThis.setInterval(() => {
            client.send({ data: {}, event: 'heartbeat' });
          }, 20_000);
          request.signal.addEventListener(
            'abort',
            () => {
              globalThis.clearInterval(heartbeat);
              clients.delete(mockClient);
            },
            { once: true },
          );
          client.send({ retry: 3_000 });
          client.send({ data: {}, event: 'realtime-ready' });
        }),
      ];
