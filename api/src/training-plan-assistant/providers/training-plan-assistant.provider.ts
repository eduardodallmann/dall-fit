import type {
  AssistantCatalogExercise,
  AssistantProposal,
  AssistantQuestion,
} from '~/training-plan-assistant/domain/training-plan-assistant.types';

export type AssistantInterpretationKind =
  'answer' | 'clarification' | 'correction' | 'injection' | 'off_topic';

export interface InterpretAssistantAnswerInput {
  candidateQuestions: readonly AssistantQuestion[];
  currentQuestion: AssistantQuestion;
  existingAnswers: Readonly<Record<string, string>>;
  text: string;
}

export interface AssistantAnswerInterpretation {
  anticipatedAnswers?: readonly {
    questionKey: string;
    suggestedValue: string;
  }[];
  clarification?: string;
  extractedSchedule?: {
    durationMinutes?: number;
    frequency?: number;
  };
  kind: AssistantInterpretationKind;
  suggestedValue?: string;
}

export interface ReformulateAssistantQuestionInput {
  currentQuestion: AssistantQuestion;
  invalidAttemptCount: number;
}

export interface AssistantQuestionReformulation {
  text: string;
}

export interface ProposeTrainingPlanInput {
  adjustment?: string;
  answers: Readonly<Record<string, string>>;
  candidates: readonly AssistantCatalogExercise[];
  catalogVersion: string;
  knowledgeVersion: string;
  promptVersion: string;
}

export abstract class TrainingPlanAssistantProvider {
  abstract interpret(
    input: InterpretAssistantAnswerInput,
  ): Promise<AssistantAnswerInterpretation>;

  abstract reformulate(
    input: ReformulateAssistantQuestionInput,
  ): Promise<AssistantQuestionReformulation>;

  abstract propose(input: ProposeTrainingPlanInput): Promise<AssistantProposal>;
}
