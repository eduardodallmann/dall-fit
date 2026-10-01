import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class TrainingWorkoutParamsDto {
  @IsMongoId()
  workoutId!: string;
}

export class TrainingPlanChoiceQueryDto {
  @IsMongoId()
  @IsOptional()
  catalogEntryId?: string;
}

export class TrainingExerciseParamsDto {
  @IsMongoId()
  exerciseId!: string;
}

export class TrainingSeriesParamsDto extends TrainingExerciseParamsDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Max(100)
  @Min(1)
  seriesNumber!: number;
}

export class WorkoutExecutionParamsDto {
  @IsMongoId()
  workoutExecutionId!: string;
}

export class TrainingLoadDto {
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsInt()
  @Max(9999)
  @Min(0)
  loadKg!: number | null;
}

export class CompleteRemainingTrainingSeriesDto {
  @ArrayMaxSize(100)
  @IsArray()
  loadsKg!: readonly (number | null)[];
}

export class StartTrainingTimerDto {
  @IsIn(['duration', 'pause'])
  kind!: 'duration' | 'pause';
}

export class ResolveTrainingTimerDto {
  @IsIn(['cancel', 'finish', 'skip'])
  outcome!: 'cancel' | 'finish' | 'skip';
}

export class CompleteTrainingSessionDto {
  @IsBoolean()
  confirmIncomplete!: boolean;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  timezone!: string;
}

export class EmptyTrainingDto {}
