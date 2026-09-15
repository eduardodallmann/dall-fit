import { IsUUID } from 'class-validator';

import type { RegisterOfflineTrainingLeaseRequest } from '@dall-fit/types';

export class OfflineTrainingLeaseDto implements RegisterOfflineTrainingLeaseRequest {
  @IsUUID('4')
  installationId!: string;
}
