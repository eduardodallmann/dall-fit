import type {
  BodyArea,
  TrainingPlanAssistantDraft,
  TrainingPlanAssistantScreeningOutcome,
  TrainingPlanAssistantSession,
  TrainingPlanAssistantStatus,
} from '@dall-fit/types';

interface AssistantCatalogBase {
  active: boolean;
  bodyArea: BodyArea;
  equipment: readonly string[];
  goalTags: readonly string[];
  impact: 'high' | 'low' | 'none';
  instructions: string;
  key: string;
  level: 'advanced' | 'beginner' | 'intermediate';
  movementPattern: string;
  name: string;
  notes: string;
  requiresSupport: boolean;
  category: 'strength' | 'warmup' | 'cardio' | 'cooldown' | 'stretching';
}

export type AssistantCatalogExercise = AssistantCatalogBase &
  (
    | { type: 'youtube-short'; youtubeId: string }
    | {
        type: 'duration';
        youtubeId?: string;
        minDurationMinutes: number;
        maxDurationMinutes: number;
      }
  );

export interface AssistantQuestion {
  key: string;
  prompt: string;
  options: readonly { label: string; value: string }[];
  sensitive?: boolean;
  when?: { key: string; values: readonly string[] };
}

export interface AssistantKnowledge {
  catalogVersion: string;
  noticeVersion: string;
  promptVersion: string;
  version: string;
  questions: readonly AssistantQuestion[];
}

export interface AssistantOperationReceipt {
  hash: string;
  session: TrainingPlanAssistantSession;
}

export interface AssistantStoredMessage {
  id: string;
  role: 'assistant' | 'person';
  text: string;
  createdAt: Date;
}

export interface AssistantSessionEntity {
  active: boolean;
  answers: Readonly<Record<string, string>>;
  catalogVersion: string;
  createdAt: Date;
  currentQuestionKey: string | null;
  expiresAt: Date;
  generatedDraft: TrainingPlanAssistantDraft | null;
  id: string;
  invalidAttempts: Readonly<Record<string, number>>;
  knowledgeVersion: string;
  materialization: {
    catalogEntryId: string;
    idempotencyHash: string;
    trainingPlanId: string;
  } | null;
  messages: readonly AssistantStoredMessage[];
  model: string;
  noticeVersion: string;
  operationKeys: Readonly<Record<string, AssistantOperationReceipt>>;
  personId: string;
  promptVersion: string;
  provider: string;
  screeningOutcome: TrainingPlanAssistantScreeningOutcome;
  status: TrainingPlanAssistantStatus | 'completed';
  updatedAt: Date;
  version: number;
}

export type AssistantProposalExercise = { catalogKey: string } & (
  | { repetitions: number; restSeconds: number; sets: number }
  | { durationMinutes: number }
);

export interface AssistantProposalWorkout {
  exercises: readonly AssistantProposalExercise[];
  name: string;
}

export interface AssistantProposal {
  description: string;
  planName: string;
  workouts: readonly AssistantProposalWorkout[];
}

export interface AssistantConfirmationReceipt {
  catalogEntryId: string;
  expiresAt: Date;
  idempotencyHash: string;
  personId: string;
  trainingPlanId: string;
}
