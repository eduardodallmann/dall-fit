import type { TrainingPlanAssistantSession } from '@dall-fit/types';

const now = '2026-08-26T12:00:00.000Z';
const expiresAt = '2026-09-02T12:00:00.000Z';

type FixtureState =
  'blocked' | 'clarifying' | 'collecting' | 'emergency' | 'preview' | 'ready';

const messages: Record<FixtureState, string> = {
  blocked:
    'Antes de iniciar um plano, procure avaliação profissional apropriada.',
  clarifying: 'Preciso de uma resposta mais objetiva antes de continuar.',
  collecting: 'Qual é o principal objetivo do seu plano?',
  emergency:
    'Interrompa qualquer atividade agora e procure atendimento de emergência apropriado.',
  preview: 'Preparei uma prévia. Revise antes de criar o plano.',
  ready: 'As respostas obrigatórias foram concluídas.',
};

const outcomes: Record<
  FixtureState,
  TrainingPlanAssistantSession['screeningOutcome']
> = {
  blocked: 'requer_avaliacao_profissional',
  clarifying: 'precisa_esclarecimento',
  collecting: null,
  emergency: 'emergencia',
  preview: 'apto_para_fluxo_geral',
  ready: 'apto_para_fluxo_geral',
};

export function createAssistantSessionFixture(
  state: FixtureState,
): TrainingPlanAssistantSession {
  const collecting = state === 'collecting';
  const result: TrainingPlanAssistantSession = {
    availableAnswers: collecting
      ? [
          { label: 'Saúde geral', value: 'general-health' },
          { label: 'Condicionamento', value: 'conditioning' },
          { label: 'Hipertrofia', value: 'hypertrophy' },
        ]
      : [],
    createdAt: now,
    currentPrompt: collecting
      ? 'Qual é o principal objetivo do seu plano?'
      : null,
    draft: state === 'preview' ? createPreviewDraft() : null,
    expiresAt,
    id: '94b000000000000000000001',
    messages: [
      {
        createdAt: now,
        id: 'assistant-message-1',
        role: 'assistant',
        text: messages[state],
      },
    ],
    noticeVersion: 'assistant-notice.v1',
    screeningOutcome: outcomes[state],
    status: state === 'emergency' ? 'blocked' : state,
    updatedAt: now,
    version: 3,
  };
  return result;
}

function createPreviewDraft(): NonNullable<
  TrainingPlanAssistantSession['draft']
> {
  return {
    description: 'Sugestão informativa para três dias por semana.',
    planName: 'Meu plano personalizado',
    workouts: [
      {
        estimatedDurationMinutes: 35,
        exercises: [
          {
            bodyArea: 'quadriceps',
            catalogKey: 'youtube-short:n4rakmCKJkg',
            name: 'Leg press sentado',
            repetitions: 12,
            restSeconds: 60,
            sets: 3,
            type: 'youtube-short',
            youtubeId: 'n4rakmCKJkg',
          },
        ],
        name: 'Treino A',
      },
      {
        estimatedDurationMinutes: 35,
        exercises: [
          {
            bodyArea: 'back',
            catalogKey: 'youtube-short:WiOlNR2g3rA',
            name: 'Puxada alta articulada',
            repetitions: 12,
            restSeconds: 60,
            sets: 3,
            type: 'youtube-short',
            youtubeId: 'WiOlNR2g3rA',
          },
        ],
        name: 'Treino B',
      },
    ],
  };
}
