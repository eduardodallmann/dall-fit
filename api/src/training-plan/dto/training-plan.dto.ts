import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { BODY_AREAS, type BodyArea, type ExerciseType } from '@dall-fit/types';

const exerciseTypes: readonly ExerciseType[] = [
  'youtube-short',
  'image',
  'youtube-long',
  'pause',
  'duration',
];

function trimString({ value }: { value: unknown }): unknown {
  const result = typeof value === 'string' ? value.trim() : value;
  return result;
}

export class ListTrainingPlansQueryDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
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

export class TrainingPlanExerciseParamsDto extends TrainingPlanWorkoutParamsDto {
  @IsMongoId()
  exerciseId!: string;
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

export class UpdateTrainingPlanWorkoutDto {
  @IsString()
  @MaxLength(120)
  @MinLength(1)
  @Transform(trimString)
  name!: string;
}

export class CreateExerciseDto {
  @IsIn(exerciseTypes)
  type!: ExerciseType;
}

export class UpdateExerciseDto {
  @IsString()
  @MaxLength(40)
  @MinLength(1)
  @Transform(trimString)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(2048)
  @MinLength(1)
  @Transform(trimString)
  @IsOptional()
  youtubeId?: string;

  @IsIn(BODY_AREAS)
  @IsOptional()
  bodyArea?: BodyArea;

  @IsInt()
  @Min(0)
  @Max(3600)
  @IsOptional()
  restSeconds?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  sets?: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  repetitions?: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  durationMinutes?: number;
}

export class ReorderExercisesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsMongoId({ each: true })
  exerciseIds!: string[];
}
