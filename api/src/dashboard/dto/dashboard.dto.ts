import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DashboardQueryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  timezone!: string;
}
