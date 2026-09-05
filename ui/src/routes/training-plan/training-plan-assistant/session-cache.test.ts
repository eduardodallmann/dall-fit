import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type { TrainingPlanAssistantSession } from '@dall-fit/types';

import { commitAssistantSession } from '~/routes/training-plan/training-plan-assistant/session-cache';

const queryKey = ['training-plans', 'assistant', 'success'] as const;

function session(version: number): TrainingPlanAssistantSession {
  return {
    availableAnswers: [],
    createdAt: '2026-09-04T12:00:00.000Z',
    currentPrompt: `Pergunta da versão ${version}`,
    draft: null,
    expiresAt: '2026-09-11T12:00:00.000Z',
    id: '94b000000000000000000001',
    messages: [],
    noticeVersion: 'assistant-notice.v1',
    screeningOutcome: null,
    status: 'collecting',
    updatedAt: '2026-09-04T12:00:00.000Z',
    version,
  };
}

describe('commitAssistantSession', () => {
  it('preserves the newest canonical session when an older response arrives', () => {
    const queryClient = new QueryClient();
    commitAssistantSession(queryClient, queryKey, session(4));
    commitAssistantSession(queryClient, queryKey, session(3));

    expect(
      queryClient.getQueryData<TrainingPlanAssistantSession>(queryKey),
    ).toEqual(session(4));
  });

  it('accepts a newer session and an explicit session removal', () => {
    const queryClient = new QueryClient();
    commitAssistantSession(queryClient, queryKey, session(3));
    commitAssistantSession(queryClient, queryKey, session(4));
    expect(
      queryClient.getQueryData<TrainingPlanAssistantSession>(queryKey),
    ).toEqual(session(4));

    commitAssistantSession(queryClient, queryKey, null);
    expect(queryClient.getQueryData(queryKey)).toBeNull();
  });
});
