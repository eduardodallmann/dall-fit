import type { TrainingPlanAssistantSession } from '@dall-fit/types';

const now = '2026-08-26T12:00:00.000Z';
const expiresAt = '2026-09-02T12:00:00.000Z';

type FixtureState =
  | 'blocked'
  | 'clarifying'
  | 'collecting'
  | 'emergency'
  | 'neutral-screening'
  | 'preview'
  | 'ready';

const messages: Record<FixtureState, string> = {
  blocked:
    'Antes de iniciar um plano, procure avaliação profissional apropriada.',
  clarifying: 'Preciso de uma resposta mais objetiva antes de continuar.',
  collecting: 'Qual é o principal objetivo do seu plano?',
  emergency:
    'Interrompa qualquer atividade agora e procure atendimento de emergência apropriado.',
  'neutral-screening':
    'Existe alguma situação que exija acompanhamento profissional para você começar a se exercitar, como gestação, pós-parto ou outra condição específica?',
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
  'neutral-screening': null,
  preview: 'apto_para_fluxo_geral',
  ready: 'apto_para_fluxo_geral',
};

export function createAssistantSessionFixture(
  state: FixtureState,
): TrainingPlanAssistantSession {
  const collecting = state === 'collecting';
  const neutralScreening = state === 'neutral-screening';
  let availableAnswers: TrainingPlanAssistantSession['availableAnswers'] = [];
  let currentPrompt: string | null = null;
  let status: TrainingPlanAssistantSession['status'] = 'collecting';
  if (neutralScreening) {
    availableAnswers = [
      { label: 'Não', value: 'no' },
      { label: 'Sim', value: 'yes' },
      { label: 'Não sei', value: 'unknown' },
    ];
    currentPrompt = messages['neutral-screening'];
    status = 'collecting';
  } else if (collecting) {
    availableAnswers = [
      { label: 'Saúde geral', value: 'general-health' },
      { label: 'Condicionamento', value: 'conditioning' },
      { label: 'Hipertrofia', value: 'hypertrophy' },
    ];
    currentPrompt = 'Qual é o principal objetivo do seu plano?';
  } else if (state === 'emergency') {
    status = 'blocked';
  } else {
    status = state;
  }
  const result: TrainingPlanAssistantSession = {
    availableAnswers,
    createdAt: now,
    currentPrompt,
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
    status,
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
        estimatedDurationMinutes: 23,
        exercises: [
          {
            catalogKey: 'duration:warmup-walk',
            type: 'duration',
            bodyArea: 'cardio',
            name: 'Aquecimento: caminhada leve',
            durationMinutes: 5,
          },
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
          {
            catalogKey: 'duration:stationary-bike',
            type: 'duration',
            bodyArea: 'cardio',
            name: 'Bicicleta ergométrica',
            durationMinutes: 5,
            instructions: 'Pedale em ritmo confortável, conseguindo conversar.',
          },
          {
            catalogKey: 'duration:cooldown-walk',
            type: 'duration',
            bodyArea: 'cardio',
            name: 'Desaquecimento: caminhada leve',
            durationMinutes: 5,
          },
          {
            catalogKey: 'duration:quadriceps-stretch',
            type: 'duration',
            bodyArea: 'quadriceps',
            name: 'Alongamento de quadríceps',
            durationMinutes: 2,
            youtubeId: 'yFvf_tdVook',
            instructions:
              'Sustente por 10–20 s, 3 vezes por lado, sem dor, dentro dos 2 min.',
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
