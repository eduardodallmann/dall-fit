import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleCallbackQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  error?: string;
}
