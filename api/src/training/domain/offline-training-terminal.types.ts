export type OfflineTrainingTerminalState = 'cancelled' | 'completed';

export interface NewOfflineTrainingTerminalReceipt {
  acceptedAt: Date;
  contentHash: string;
  executionId: string;
  personId: string;
  revision: number;
  terminalState: OfflineTrainingTerminalState;
  workoutExecutionId?: string;
}

export interface StoredOfflineTrainingTerminalReceipt extends NewOfflineTrainingTerminalReceipt {
  createdAt: Date;
  id: string;
  updatedAt: Date;
}
