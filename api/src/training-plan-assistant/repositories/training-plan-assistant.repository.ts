import type {
  AssistantConfirmationReceipt,
  AssistantSessionEntity,
} from '~/training-plan-assistant/domain/training-plan-assistant.types';

export abstract class TrainingPlanAssistantRepository {
  abstract create(
    session: Omit<AssistantSessionEntity, 'id'>,
  ): Promise<AssistantSessionEntity>;
  abstract findActive(personId: string): Promise<AssistantSessionEntity | null>;
  abstract save(
    session: AssistantSessionEntity,
    expectedVersion: number,
  ): Promise<AssistantSessionEntity | null>;
  abstract deleteActive(personId: string): Promise<void>;
  abstract findReceipt(
    personId: string,
    idempotencyHash: string,
  ): Promise<AssistantConfirmationReceipt | null>;
  abstract createReceipt(
    receipt: AssistantConfirmationReceipt,
  ): Promise<AssistantConfirmationReceipt | null>;
}
