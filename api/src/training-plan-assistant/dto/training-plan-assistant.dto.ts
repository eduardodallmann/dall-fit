import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateAssistantSessionDto {
  @IsString()
  @Length(1, 40)
  noticeVersion!: string;
}

export class SendAssistantMessageDto {
  @IsUUID()
  clientMessageId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFKC').trim() : value,
  )
  @IsString()
  @Length(1, 1000)
  text!: string;
}

export class GenerateAssistantDraftDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFKC').trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustment?: string;
}
