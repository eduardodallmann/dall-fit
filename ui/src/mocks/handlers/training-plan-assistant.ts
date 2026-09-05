import { http, HttpResponse } from 'msw';

import type { TrainingPlanAssistantSession } from '@dall-fit/types';

import { createAssistantSessionFixture } from '~/mocks/fixtures/training-plan-assistant';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

const states = new Map<string, TrainingPlanAssistantSession | null>();

export function resetTrainingPlanAssistantScenarioStates(): void {
  states.clear();
}

function scenario(request: Request): string {
  return request.headers.get('x-dall-fit-mock-training-plans') ?? 'success';
}

function initialState(value: string): TrainingPlanAssistantSession | null {
  if (
    value === 'assistant-collecting' ||
    value === 'assistant-multiple-answers'
  )
    return createAssistantSessionFixture('collecting');
  if (value === 'assistant-resumed') {
    const resumed = createAssistantSessionFixture('collecting');
    return {
      ...resumed,
      messages: [
        ...resumed.messages,
        {
          createdAt: resumed.updatedAt,
          id: 'person-message-resumed',
          role: 'person',
          text: 'Saúde geral',
        },
        {
          createdAt: resumed.updatedAt,
          id: 'assistant-message-resumed',
          role: 'assistant',
          text: resumed.currentPrompt ?? '',
        },
      ],
      version: 4,
    };
  }
  if (
    value === 'assistant-clarifying' ||
    value === 'assistant-health-clarification'
  )
    return createAssistantSessionFixture('clarifying');
  if (value === 'assistant-blocked')
    return createAssistantSessionFixture('blocked');
  if (value === 'assistant-emergency')
    return createAssistantSessionFixture('emergency');
  if (value === 'assistant-preview')
    return createAssistantSessionFixture('preview');
  if (value === 'assistant-provider-error')
    return createAssistantSessionFixture('ready');
  if (value === 'assistant-version-conflict')
    return createAssistantSessionFixture('collecting');
  if (value === 'assistant-abandon')
    return createAssistantSessionFixture('collecting');
  return null;
}

function getState(value: string) {
  if (!states.has(value)) states.set(value, initialState(value));
  return states.get(value) ?? null;
}

function setState(value: string, session: TrainingPlanAssistantSession | null) {
  states.set(value, session);
}

function error(code: string, message: string, status: number) {
  return HttpResponse.json(
    createMockApiError(code, message),
    createMockResponseInit({ status }),
  );
}

function versionConflict(
  request: Request,
  session: TrainingPlanAssistantSession,
) {
  const expected = request.headers.get('x-resource-version');
  return expected !== String(session.version)
    ? error(
        'ASSISTANT_SESSION_VERSION_CONFLICT',
        'Assistant session version conflict.',
        412,
      )
    : null;
}

export const trainingPlanAssistantHandlers = [
  http.get('*/training-plan-assistant/session', ({ request }) => {
    const session = getState(scenario(request));
    return session === null
      ? new HttpResponse(null, createMockResponseInit({ status: 204 }))
      : HttpResponse.json({ data: session }, createMockResponseInit());
  }),
  http.post('*/training-plan-assistant/session', ({ request }) => {
    const value = scenario(request);
    const existing = getState(value);
    if (existing !== null)
      return HttpResponse.json({ data: existing }, createMockResponseInit());
    const created = createAssistantSessionFixture('collecting');
    setState(value, created);
    return HttpResponse.json(
      { data: created },
      createMockResponseInit({ status: 201 }),
    );
  }),
  http.post(
    '*/training-plan-assistant/session/messages',
    async ({ request }) => {
      const value = scenario(request);
      const current = getState(value);
      if (current === null)
        return error('ASSISTANT_SESSION_NOT_FOUND', 'Session not found.', 404);
      const conflict = versionConflict(request, current);
      if (conflict !== null) return conflict;
      const body = (await request.json()) as {
        clientMessageId: string;
        text: string;
      };
      let next = createAssistantSessionFixture('collecting');
      if (value === 'assistant-blocked')
        next = createAssistantSessionFixture('blocked');
      if (value === 'assistant-emergency')
        next = createAssistantSessionFixture('emergency');
      if (
        value === 'assistant-clarifying' ||
        value === 'assistant-health-clarification'
      )
        next = createAssistantSessionFixture('clarifying');
      const visibleText =
        current.availableAnswers.find((answer) => answer.value === body.text)
          ?.label ?? body.text;
      next = {
        ...next,
        messages: [
          ...current.messages,
          {
            createdAt: new Date().toISOString(),
            id: body.clientMessageId,
            role: 'person',
            text: visibleText,
          },
          ...next.messages.map((message) => ({
            ...message,
            id: `${message.id}-${current.version + 1}`,
          })),
        ],
        version: current.version + 1,
      };
      setState(value, next);
      return HttpResponse.json({ data: next }, createMockResponseInit());
    },
  ),
  http.post('*/training-plan-assistant/session/drafts', ({ request }) => {
    const value = scenario(request);
    const current = getState(value);
    if (current === null)
      return error('ASSISTANT_SESSION_NOT_FOUND', 'Session not found.', 404);
    const conflict = versionConflict(request, current);
    if (conflict !== null) return conflict;
    if (value === 'assistant-provider-error')
      return error(
        'ASSISTANT_PROVIDER_UNAVAILABLE',
        'Provider unavailable.',
        503,
      );
    const next = {
      ...createAssistantSessionFixture('preview'),
      version: current.version + 1,
    };
    setState(value, next);
    return HttpResponse.json({ data: next }, createMockResponseInit());
  }),
  http.post('*/training-plan-assistant/session/confirm', ({ request }) => {
    const value = scenario(request);
    const current = getState(value);
    if (current === null)
      return error('ASSISTANT_SESSION_NOT_FOUND', 'Session not found.', 404);
    const conflict = versionConflict(request, current);
    if (conflict !== null) return conflict;
    setState(value, null);
    return HttpResponse.json(
      {
        data: {
          catalogEntryId: '74b000000000000000000099',
          trainingPlanId: '64b000000000000000000099',
        },
      },
      createMockResponseInit({ status: 201 }),
    );
  }),
  http.delete('*/training-plan-assistant/session', ({ request }) => {
    setState(scenario(request), null);
    return new HttpResponse(null, createMockResponseInit({ status: 204 }));
  }),
];
