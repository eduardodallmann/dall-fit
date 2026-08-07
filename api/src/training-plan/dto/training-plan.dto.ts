import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  const result = typeof value === 'string' ? value.trim() : value;

  return result;
}

export class ListTrainingPlansQueryDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;
}

export class TrainingPlanParamsDto {
  @IsMongoId()
  trainingPlanId!: string;
}

export class TrainingPlanWorkoutParamsDto extends TrainingPlanParamsDto {
  @IsMongoId()
  workoutId!: string;
}

export class CreateTrainingPlanDto {
  @IsString()
  @MaxLength(120)
  @MinLength(1)
  @Transform(trimString)
  name!: string;

  @IsString()
  @MaxLength(1000)
  @MinLength(1)
  @Transform(trimString)
  description!: string;
}

export class UpdateTrainingPlanDto {
  @IsString()
  @MaxLength(120)
  @MinLength(1)
  @Transform(trimString)
  @ValidateIf(
    (input: UpdateTrainingPlanDto) =>
      input.name !== undefined || input.description === undefined,
  )
  name?: string;

  @IsString()
  @MaxLength(1000)
  @MinLength(1)
  @Transform(trimString)
  @ValidateIf((input: UpdateTrainingPlanDto) => input.description !== undefined)
  description?: string;
}

export class EmptyTrainingPlanRequestDto {}
