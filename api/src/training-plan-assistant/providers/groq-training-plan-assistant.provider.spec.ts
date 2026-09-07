import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroqTrainingPlanAssistantProvider } from '~/training-plan-assistant/providers/groq-training-plan-assistant.provider';

const currentQuestion = {
  key: 'adult',
  options: [
    { label: 'Sim', value: 'yes' },
    { label: 'Não', value: 'no' },
  ],
  prompt: 'Você confirma que tem 18 anos ou mais?',
};

function createProvider(model: string): GroqTrainingPlanAssistantProvider {
  const values: Readonly<Record<string, unknown>> = {
    TRAINING_PLAN_ASSISTANT_GROQ_API_KEY: 'test-key',
    TRAINING_PLAN_ASSISTANT_MAX_COMPLETION_TOKENS: 2_048,
    TRAINING_PLAN_ASSISTANT_MODEL: model,
    TRAINING_PLAN_ASSISTANT_PROVIDER_TIMEOUT_MS: 5_000,
  };
  return new GroqTrainingPlanAssistantProvider({
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService);
}

function successfulResponse(content: unknown): Response {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { completion_tokens: 4, prompt_tokens: 8, total_tokens: 12 },
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON request body');
  const result = JSON.parse(body) as Record<string, unknown>;
  return result;
}

describe('GroqTrainingPlanAssistantProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses strict JSON Schema for a compatible model and still validates locally', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulResponse({
        anticipatedAnswers: [],
        clarification: null,
        extractedSchedule: { durationMinutes: null, frequency: null },
        kind: 'answer',
        suggestedValue: null,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createProvider('openai/gpt-oss-20b').interpret({
        candidateQuestions: [],
        currentQuestion,
        existingAnswers: {},
        text: 'sim',
      }),
    ).resolves.toEqual({ kind: 'answer' });

    const request = requestBody(fetchMock);
    expect(request.max_completion_tokens).toBe(2_048);
    expect(request.response_format).toMatchObject({
      json_schema: {
        name: 'training_plan_assistant_interpret',
        schema: {
          additionalProperties: false,
          required: [
            'anticipatedAnswers',
            'clarification',
            'kind',
            'extractedSchedule',
            'suggestedValue',
          ],
          type: 'object',
        },
        strict: true,
      },
      type: 'json_schema',
    });
  });

  it('uses JSON Object Mode for the evaluated Llama model', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(successfulResponse({ text: 'Escolha Sim ou Não.' }));
    vi.stubGlobal('fetch', fetchMock);

    await createProvider('llama-3.3-70b-versatile').reformulate({
      currentQuestion,
      invalidAttemptCount: 2,
    });

    const request = requestBody(fetchMock);
    expect(request.response_format).toEqual({ type: 'json_object' });
  });

  it('sends every locally enforced proposal rule to the provider', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulResponse({
        description: 'Plano geral.',
        planName: 'Meu plano',
        workouts: [
          {
            exercises: [
              {
                catalogKey: 'youtube-short:exercise-1',
                repetitions: 12,
                restSeconds: 60,
                sets: 3,
              },
            ],
            name: 'Treino A',
          },
          {
            exercises: [
              {
                catalogKey: 'youtube-short:exercise-1',
                repetitions: 12,
                restSeconds: 60,
                sets: 3,
              },
            ],
            name: 'Treino B',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createProvider('openai/gpt-oss-120b').propose({
      answers: { duration: '45', frequency: '2' },
      candidates: [
        {
          active: true,
          category: 'strength',
          bodyArea: 'back',
          equipment: ['machine'],
          goalTags: ['general-health'],
          impact: 'none',
          instructions: 'Execute de forma controlada.',
          key: 'youtube-short:exercise-1',
          level: 'beginner',
          movementPattern: 'pull',
          name: 'Puxada',
          notes: '',
          requiresSupport: false,
          type: 'youtube-short',
          youtubeId: 'exercise-1',
        },
      ],
      catalogVersion: 'exercise-catalog.v2',
      currentDraft: {
        description: 'Prévia original.',
        planName: 'Plano original',
        workouts: [
          {
            estimatedDurationMinutes: 5,
            exercises: [
              {
                bodyArea: 'back',
                catalogKey: 'youtube-short:exercise-1',
                name: 'Puxada',
                repetitions: 12,
                restSeconds: 60,
                sets: 3,
                type: 'youtube-short',
                youtubeId: 'exercise-1',
              },
            ],
            name: 'Treino A',
          },
        ],
      },
      knowledgeVersion: 'fitness-guidelines.v3',
      promptVersion: 'training-plan-assistant.v2',
    });

    const request = requestBody(fetchMock);
    const messages = request.messages as { content: string }[];
    const payload = JSON.parse(messages[1]?.content ?? '{}') as {
      untrustedData?: { generationRules?: Record<string, unknown> };
    };
    expect(payload.untrustedData?.generationRules).toMatchObject({
      maxDurationMinutes: 45,
      maxExercisesPerWorkout: 12,
      minExercisesPerWorkout: 1,
      outputLocale: 'pt-BR',
      requiredWorkoutCount: 2,
      uniqueCatalogKeyWithinWorkout: true,
    });
    expect(payload.untrustedData).toMatchObject({
      currentDraft: {
        description: 'Prévia original.',
        planName: 'Plano original',
        workouts: [
          {
            exercises: [
              {
                catalogKey: 'youtube-short:exercise-1',
                repetitions: 12,
                restSeconds: 60,
                sets: 3,
              },
            ],
            name: 'Treino A',
          },
        ],
      },
    });
    expect(messages[0]?.content).toContain('português do Brasil');
    expect(messages[0]?.content).toContain(
      'preserve integralmente tudo que o adjustment não pedir para mudar',
    );
  });

  it('retries once to translate generated presentation text to pt-BR', async () => {
    const exercises = [
      {
        catalogKey: 'youtube-short:exercise-1',
        repetitions: 12,
        restSeconds: 60,
        sets: 3,
      },
    ];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        successfulResponse({
          description: 'This workout builds strength for the whole body.',
          planName: 'Balanced fitness plan',
          workouts: [
            { exercises, name: 'Upper body' },
            { exercises, name: 'Lower body' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        successfulResponse({
          description:
            'Plano equilibrado para desenvolver força no corpo todo.',
          planName: 'Evolução equilibrada',
          workouts: [
            { exercises, name: 'Força de tronco' },
            { exercises, name: 'Base de pernas' },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createProvider('openai/gpt-oss-120b').propose({
      answers: { duration: '45', frequency: '2' },
      candidates: [
        {
          active: true,
          bodyArea: 'back',
          category: 'strength',
          equipment: ['machine'],
          goalTags: ['general-health'],
          impact: 'none',
          instructions: 'Execute de forma controlada.',
          key: 'youtube-short:exercise-1',
          level: 'beginner',
          movementPattern: 'pull',
          name: 'Puxada',
          notes: '',
          requiresSupport: false,
          type: 'youtube-short',
          youtubeId: 'exercise-1',
        },
      ],
      catalogVersion: 'exercise-catalog.v2',
      knowledgeVersion: 'fitness-guidelines.v3',
      promptVersion: 'training-plan-assistant.v2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      description: 'Plano equilibrado para desenvolver força no corpo todo.',
      planName: 'Evolução equilibrada',
      workouts: [{ name: 'Força de tronco' }, { name: 'Base de pernas' }],
    });
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body;
    expect(typeof secondBody).toBe('string');
    expect(secondBody).toContain('previousProposal');
    expect(secondBody).toContain('reescreva somente');
  });

  it('extracts a free schedule without forcing it into a quick answer', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulResponse({
        anticipatedAnswers: [],
        clarification: null,
        extractedSchedule: { durationMinutes: 30, frequency: 7 },
        kind: 'clarification',
        suggestedValue: null,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createProvider('openai/gpt-oss-120b').interpret({
        candidateQuestions: [],
        currentQuestion: {
          key: 'schedule',
          options: [{ label: '3 dias, 45 minutos', value: '3-45' }],
          prompt: 'Qual combinação funciona para você?',
        },
        existingAnswers: {},
        text: 'sete dias por semana, meia hora por dia',
      }),
    ).resolves.toEqual({
      extractedSchedule: { durationMinutes: 30, frequency: 7 },
      kind: 'clarification',
    });

    const request = requestBody(fetchMock);
    const messages = request.messages as { content: string }[];
    expect(messages[0]?.content).toContain('nunca trate isso como off_topic');
  });

  it.each([
    [429, { 'retry-after': '30' }, 2_000],
    [503, undefined, 250],
  ])(
    'retries transient status %s once with bounded backoff and then succeeds',
    async (status, headers, delayMs) => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { headers, status }))
        .mockResolvedValueOnce(
          successfulResponse({ text: 'Tente novamente.' }),
        );
      vi.stubGlobal('fetch', fetchMock);

      const pending = createProvider('llama-3.3-70b-versatile').reformulate({
        currentQuestion,
        invalidAttemptCount: 2,
      });
      await vi.advanceTimersByTimeAsync(delayMs);

      await expect(pending).resolves.toEqual({ text: 'Tente novamente.' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('does not retry a non-transient provider response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createProvider('llama-3.3-70b-versatile').reformulate({
        currentQuestion,
        invalidAttemptCount: 2,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts at the configured timeout without starting another request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = createProvider('llama-3.3-70b-versatile').reformulate({
      currentQuestion,
      invalidAttemptCount: 2,
    });
    const rejection = expect(pending).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
