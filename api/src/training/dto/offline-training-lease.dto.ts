import { IsUUID } from 'class-validator';

export class OfflineTrainingLeaseDto {
  @IsUUID('4')
  installationId!: string;
}
