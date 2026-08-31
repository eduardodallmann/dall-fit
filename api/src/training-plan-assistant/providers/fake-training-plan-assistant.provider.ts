import { Injectable, Logger } from '@nestjs/common';

import type {
  AssistantCatalogExercise,
  AssistantProposal,
} from '~/training-plan-assistant/domain/training-plan-assistant.types';
import {
  TrainingPlanAssistantProvider,
  type AssistantAnswerInterpretation,
  type AssistantQuestionReformulation,
  type InterpretAssistantAnswerInput,
  type ProposeTrainingPlanInput,
  type ReformulateAssistantQuestionInput,
} from '~/training-plan-assistant/providers/training-plan-assistant.provider';

@Injectable()
export class FakeTrainingPlanAssistantProvider extends TrainingPlanAssistantProvider {
  private readonly logger = new Logger(FakeTrainingPlanAssistantProvider.name);

  interpret(
    input: InterpretAssistantAnswerInput,
  ): Promise<AssistantAnswerInterpretation> {
    const normalized = input.text.normalize('NFKC').toLocaleLowerCase('pt-BR');
    const option = input.currentQuestion.options.find(
      (candidate) =>
        candidate.label.toLocaleLowerCase('pt-BR') === normalized ||
        candidate.value.toLocaleLowerCase('pt-BR') === normalized,
    );
    const result: AssistantAnswerInterpretation =
      option === undefined
        ? { kind: 'clarification' }
        : {
            kind: 'answer',
            suggestedValue: option.value,
          };
    return Promise.resolve(result);
  }

  reformulate(
    input: ReformulateAssistantQuestionInput,
  ): Promise<AssistantQuestionReformulation> {
    const result = {
      text: `Escolha uma das opções disponíveis. ${input.currentQuestion.prompt}`,
    };
    return Promise.resolve(result);
  }

  propose(input: ProposeTrainingPlanInput): Promise<AssistantProposal> {
    this.logger.log('FakeTrainingPlanAssistantProvider -> propose -> params:', {
      params: {
        adjustmentPresent: input.adjustment !== undefined,
        candidateCount: input.candidates.length,
        catalogVersion: input.catalogVersion,
      },
    });
    const frequency = Number(input.answers.frequency);
    const selected = this.selectBalanced(input.candidates, frequency * 5);
    if (selected.length < frequency) {
      throw new Error('Not enough eligible exercises for a proposal.');
    }
    const workouts = Array.from({ length: frequency }, (_, workoutIndex) => {
      const exercises = selected
        .filter((_, index) => index % frequency === workoutIndex)
        .slice(0, 7)
        .map((exercise) => ({
          catalogKey: exercise.key,
          repetitions: 12,
          restSeconds: 60,
          sets: input.answers.experience === 'advanced' ? 4 : 3,
        }));
      return {
        exercises,
        name: `Treino ${String.fromCharCode(65 + workoutIndex)}`,
      };
    });
    const result = {
      description:
        'Sugestão informativa criada a partir das respostas e do catálogo aprovado.',
      planName: 'Meu plano personalizado',
      workouts,
    };
    if (input.adjustment === 'assistant:draft-invalid') {
      const firstWorkout = result.workouts[0];
      const firstExercise = firstWorkout?.exercises[0];
      if (firstWorkout !== undefined && firstExercise !== undefined) {
        firstWorkout.exercises[0] = {
          ...firstExercise,
          catalogKey: 'youtube-short:invalid00000',
        };
      }
    }
    this.logger.log('FakeTrainingPlanAssistantProvider -> propose -> return:', {
      data: { workoutCount: result.workouts.length },
    });
    return Promise.resolve(result);
  }

  private selectBalanced(
    candidates: readonly AssistantCatalogExercise[],
    limit: number,
  ) {
    const priority = [
      'quadriceps',
      'back',
      'chest',
      'hamstrings',
      'shoulder',
      'glutes',
      'biceps',
      'triceps',
      'calf',
      'abdomen',
      'adductor',
      'lower-back',
    ];
    const grouped = new Map<string, AssistantCatalogExercise[]>();
    for (const candidate of candidates) {
      const entries = grouped.get(candidate.bodyArea) ?? [];
      entries.push(candidate);
      grouped.set(candidate.bodyArea, entries);
    }
    const result: AssistantCatalogExercise[] = [];
    let offset = 0;
    while (result.length < limit) {
      let added = false;
      for (const area of priority) {
        const candidate = grouped.get(area)?.[offset];
        if (candidate !== undefined) {
          result.push(candidate);
          added = true;
          if (result.length === limit) break;
        }
      }
      if (!added) break;
      offset += 1;
    }
    return result;
  }
}
