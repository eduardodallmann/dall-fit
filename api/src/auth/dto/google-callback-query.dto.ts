import { Exclude, Expose } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@Exclude()
export class GoogleCallbackQueryDto {
  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  state?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  error?: string;
}
