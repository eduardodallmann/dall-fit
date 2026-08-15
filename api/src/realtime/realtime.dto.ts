import { IsUUID } from 'class-validator';

export class RealtimeEventsQueryDto {
  @IsUUID()
  clientInstanceId!: string;
}
