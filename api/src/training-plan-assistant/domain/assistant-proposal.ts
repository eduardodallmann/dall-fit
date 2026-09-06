import { z } from 'zod';

import type {
  TrainingPlanAssistantDraft,
  TrainingPlanAssistantDraftExercise,
} from '@dall-fit/types';

import type { AssistantCatalogExercise } from '~/training-plan-assistant/domain/training-plan-assistant.types';
import { assistantDraftInvalid } from '~/training-plan-assistant/errors/training-plan-assistant.errors';

const englishTrainingTerms =
  /\b(?:balanced|fitness|upper\s+body|lower\s+body|full[\s-]?body|workout|training|strength|push|pull|legs?|chest|back|arms?|shoulders?)\b/i;
const englishFunctionWords = new Set([
  'and',
  'are',
  'each',
  'for',
  'in',
  'is',
  'of',
  'on',
  'the',
  'this',
  'to',
  'with',
  'your',
]);
const portugueseFunctionWords = new Set([
  'a',
  'as',
  'cada',
  'com',
  'da',
  'de',
  'do',
  'e',
  'em',
  'é',
  'o',
  'os',
  'para',
  'são',
  'seu',
  'sua',
]);

const localizedTextSchema = (max: number, field: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .describe(`${field} escrito em português do Brasil.`);

export const proposalSchema = z.strictObject({
  description: localizedTextSchema(1000, 'Descrição do plano'),
  planName: localizedTextSchema(120, 'Título do plano'),
  workouts: z
    .array(
      z.strictObject({
        exercises: z
          .array(
            z.union([
              z.strictObject({
                catalogKey: z.string().min(1),
                repetitions: z.number().int().min(1).max(1000),
                restSeconds: z.number().int().min(0).max(3600),
                sets: z.number().int().min(1).max(100),
              }),
              z.strictObject({
                catalogKey: z.string().min(1),
                durationMinutes: z.number().int().min(1).max(30),
              }),
            ]),
          )
          .min(1)
          .max(12),
        name: localizedTextSchema(120, 'Título do treino'),
      }),
    )
    .min(2)
    .max(7),
});

const legAreas = new Set([
  'quadriceps',
  'hamstrings',
  'glutes',
  'calf',
  'adductor',
]);
const phaseOrder = {
  warmup: 0,
  strength: 1,
  cardio: 2,
  cooldown: 3,
  stretching: 4,
};

export function mapAssistantProposal(
  input: unknown,
  candidates: readonly AssistantCatalogExercise[],
  answers: Readonly<Record<string, string>>,
  requireCardio = false,
): TrainingPlanAssistantDraft {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) throw assistantDraftInvalid();
  const proposal = parsed.data;
  if (!proposalUsesPtBR(proposal)) throw assistantDraftInvalid();
  if (proposal.workouts.length !== Number(answers.frequency))
    throw assistantDraftInvalid();
  const allowed = new Map(candidates.map((entry) => [entry.key, entry]));
  const workouts = proposal.workouts.map((workout) =>
    mapWorkout(workout, allowed, answers),
  );
  const requiresCardio =
    requireCardio &&
    Number(answers.duration) >= 30 &&
    candidates.some((entry) => entry.category === 'cardio');
  if (
    requiresCardio &&
    !workouts.some((workout) =>
      workout.exercises.some(
        (exercise) => allowed.get(exercise.catalogKey)?.category === 'cardio',
      ),
    )
  )
    throw assistantDraftInvalid();
  return {
    description: proposal.description,
    planName: proposal.planName,
    workouts,
  };
}

type ProposalWorkout = z.infer<typeof proposalSchema>['workouts'][number];
type ProposalExercise = ProposalWorkout['exercises'][number];

function mapWorkout(
  workout: ProposalWorkout,
  allowed: ReadonlyMap<string, AssistantCatalogExercise>,
  answers: Readonly<Record<string, string>>,
) {
  const entries = workout.exercises.map((exercise) => {
    const entry = allowed.get(exercise.catalogKey);
    if (entry === undefined) throw assistantDraftInvalid();
    return entry;
  });
  validateComposition(entries);
  const strength = entries.filter((entry) => entry.category === 'strength');
  const legDay =
    strength.filter((entry) => legAreas.has(entry.bodyArea)).length * 2 >=
    strength.length;
  const exercises = workout.exercises.map((exercise, index) => {
    const entry = entries[index];
    if (entry === undefined) throw assistantDraftInvalid();
    if (legDay && entry.category === 'cardio' && entry.impact === 'high')
      throw assistantDraftInvalid();
    return mapExercise(exercise, entry);
  });
  validateCardio(workout, entries, answers, legDay);
  const estimatedDurationMinutes = exercises.reduce(
    (total, exercise) => total + estimateMinutes(exercise),
    0,
  );
  if (estimatedDurationMinutes > Number(answers.duration))
    throw assistantDraftInvalid();
  return {
    name: workout.name,
    exercises,
    estimatedDurationMinutes,
  };
}

export function proposalUsesPtBR(
  proposal: Pick<
    z.infer<typeof proposalSchema>,
    'description' | 'planName' | 'workouts'
  >,
): boolean {
  const texts = [
    proposal.planName,
    proposal.description,
    ...proposal.workouts.map((workout) => workout.name),
  ];
  const result = texts.every((text) => {
    if (englishTrainingTerms.test(text)) return false;
    const tokens = text.toLocaleLowerCase('pt-BR').match(/[\p{L}]+/gu) ?? [];
    const englishCount = tokens.filter((token) =>
      englishFunctionWords.has(token),
    ).length;
    const portugueseCount = tokens.filter((token) =>
      portugueseFunctionWords.has(token),
    ).length;
    return englishCount <= portugueseCount;
  });
  return result;
}

function validateComposition(entries: readonly AssistantCatalogExercise[]) {
  if (new Set(entries.map((entry) => entry.key)).size !== entries.length)
    throw assistantDraftInvalid();
  const strengthCount = entries.filter(
    (entry) => entry.category === 'strength',
  ).length;
  if (strengthCount === 0 || strengthCount > 7) throw assistantDraftInvalid();
  let previousPhase = -1;
  for (const entry of entries) {
    const phase = phaseOrder[entry.category];
    if (phase < previousPhase) throw assistantDraftInvalid();
    previousPhase = phase;
  }
  if (
    !entries.some((entry) => entry.category === 'warmup') ||
    !entries.some((entry) => entry.category === 'stretching')
  )
    throw assistantDraftInvalid();
}

function validateCardio(
  workout: ProposalWorkout,
  entries: readonly AssistantCatalogExercise[],
  answers: Readonly<Record<string, string>>,
  legDay: boolean,
) {
  const cardioMinutes = workout.exercises.reduce(
    (total, exercise, index) =>
      total +
      (entries[index]?.category === 'cardio' && 'durationMinutes' in exercise
        ? exercise.durationMinutes
        : 0),
    0,
  );
  const returning =
    ['never', 'beginner'].includes(answers.experience ?? '') ||
    answers.goal === 'return' ||
    answers.interruption !== 'none';
  if (cardioMinutes > (legDay || returning ? 10 : 30))
    throw assistantDraftInvalid();
  if (
    cardioMinutes > 0 &&
    (!entries.some((entry) => entry.category === 'warmup') ||
      !entries.some((entry) => entry.category === 'cooldown'))
  )
    throw assistantDraftInvalid();
}

function mapExercise(
  exercise: ProposalExercise,
  entry: AssistantCatalogExercise,
): TrainingPlanAssistantDraftExercise {
  const common = {
    catalogKey: entry.key,
    name: entry.name,
    bodyArea: entry.bodyArea,
  };
  if (entry.type === 'duration') {
    if (
      !('durationMinutes' in exercise) ||
      exercise.durationMinutes < entry.minDurationMinutes ||
      exercise.durationMinutes > entry.maxDurationMinutes
    )
      throw assistantDraftInvalid();
    return {
      ...common,
      type: 'duration',
      durationMinutes: exercise.durationMinutes,
      instructions: entry.instructions,
      ...(entry.youtubeId === undefined ? {} : { youtubeId: entry.youtubeId }),
    };
  }
  if (!('sets' in exercise)) throw assistantDraftInvalid();
  return {
    ...common,
    type: 'youtube-short',
    youtubeId: entry.youtubeId,
    sets: exercise.sets,
    repetitions: exercise.repetitions,
    restSeconds: exercise.restSeconds,
  };
}

function estimateMinutes(exercise: TrainingPlanAssistantDraftExercise): number {
  return exercise.type === 'duration'
    ? exercise.durationMinutes
    : Math.ceil(
        (exercise.sets * (exercise.repetitions * 4 + exercise.restSeconds)) /
          60,
      );
}
