import type {
  CreateTrainingPlanAssistantSessionRequest,
  GenerateTrainingPlanAssistantDraftRequest,
  SendTrainingPlanAssistantMessageRequest,
  TrainingPlanAssistantConfirmationResponse,
  TrainingPlanAssistantSession,
  TrainingPlanAssistantSessionResponse,
} from '@dall-fit/types';

import { apiClient } from '~/core/http/api-client';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';

const MESSAGE_TIMEOUT_MS = 30_000;
const DRAFT_TIMEOUT_MS = 60_000;

function scenarioHeaders(scenario: MockTrainingPlansScenario) {
  const result =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { 'x-dall-fit-mock-training-plans': scenario }
      : {};
  return result;
}

export async function getTrainingPlanAssistantSession(
  scenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
): Promise<TrainingPlanAssistantSession | null> {
  const response = await apiClient.get<TrainingPlanAssistantSessionResponse>(
    '/training-plan-assistant/session',
    { headers: scenarioHeaders(scenario), signal },
  );
  return response.status === 204 ? null : response.data.data;
}

export async function createTrainingPlanAssistantSession(
  scenario: MockTrainingPlansScenario,
): Promise<TrainingPlanAssistantSession> {
  const input: CreateTrainingPlanAssistantSessionRequest = {
    noticeVersion: 'assistant-notice.v1',
  };
  const response = await apiClient.post<TrainingPlanAssistantSessionResponse>(
    '/training-plan-assistant/session',
    input,
    { headers: scenarioHeaders(scenario) },
  );
  return response.data.data;
}

export async function sendTrainingPlanAssistantMessage(
  scenario: MockTrainingPlansScenario,
  sessionVersion: number,
  input: SendTrainingPlanAssistantMessageRequest,
): Promise<TrainingPlanAssistantSession> {
  const response = await apiClient.post<TrainingPlanAssistantSessionResponse>(
    '/training-plan-assistant/session/messages',
    input,
    {
      headers: {
        ...scenarioHeaders(scenario),
        'X-Resource-Version': String(sessionVersion),
      },
      timeout: MESSAGE_TIMEOUT_MS,
    },
  );
  return response.data.data;
}

export async function generateTrainingPlanAssistantDraft(
  scenario: MockTrainingPlansScenario,
  sessionVersion: number,
  idempotencyKey: string,
  input: GenerateTrainingPlanAssistantDraftRequest,
): Promise<TrainingPlanAssistantSession> {
  const response = await apiClient.post<TrainingPlanAssistantSessionResponse>(
    '/training-plan-assistant/session/drafts',
    input,
    {
      headers: {
        ...scenarioHeaders(scenario),
        'Idempotency-Key': idempotencyKey,
        'X-Resource-Version': String(sessionVersion),
      },
      timeout: DRAFT_TIMEOUT_MS,
    },
  );
  return response.data.data;
}

export async function confirmTrainingPlanAssistantSession(
  scenario: MockTrainingPlansScenario,
  sessionVersion: number,
  idempotencyKey: string,
): Promise<TrainingPlanAssistantConfirmationResponse['data']> {
  const response =
    await apiClient.post<TrainingPlanAssistantConfirmationResponse>(
      '/training-plan-assistant/session/confirm',
      {},
      {
        headers: {
          ...scenarioHeaders(scenario),
          'Idempotency-Key': idempotencyKey,
          'X-Resource-Version': String(sessionVersion),
        },
        timeout: DRAFT_TIMEOUT_MS,
      },
    );
  return response.data.data;
}

export async function abandonTrainingPlanAssistantSession(
  scenario: MockTrainingPlansScenario,
): Promise<void> {
  await apiClient.delete('/training-plan-assistant/session', {
    headers: scenarioHeaders(scenario),
  });
}
