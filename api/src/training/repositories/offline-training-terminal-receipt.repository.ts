import type {
  NewOfflineTrainingTerminalReceipt,
  StoredOfflineTrainingTerminalReceipt,
} from '~/training/domain/offline-training-terminal.types';

export abstract class OfflineTrainingTerminalReceiptRepository {
  abstract find(
    personId: string,
    executionId: string,
  ): Promise<StoredOfflineTrainingTerminalReceipt | null>;
  abstract create(
    input: NewOfflineTrainingTerminalReceipt,
  ): Promise<StoredOfflineTrainingTerminalReceipt>;
}
