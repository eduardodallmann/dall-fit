import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  ValidateNested,
} from 'class-validator';

import {
  BODY_AREAS,
  type BodyArea,
  type CopyExercisesRequest,
  type ExerciseLibraryQuery,
  type ExerciseLibrarySelection,
} from '@dall-fit/types';

import { ListTrainingPlansQueryDto } from '~/training-plan/dto/training-plan.dto';

export class ExerciseLibraryQueryDto
  extends ListTrainingPlansQueryDto
  implements ExerciseLibraryQuery
{
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(BODY_AREAS)
  bodyArea?: BodyArea;
}

class ExerciseLibrarySelectionDto implements ExerciseLibrarySelection {
  @IsString()
  @MaxLength(200)
  @MinLength(1)
  groupId!: string;

  @IsMongoId()
  trainingPlanId!: string;

  @IsMongoId()
  workoutId!: string;

  @IsMongoId()
  exerciseId!: string;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;
}

export class CopyExercisesDto implements CopyExercisesRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((selection: unknown) =>
    typeof selection === 'object' &&
    selection !== null &&
    'groupId' in selection
      ? selection.groupId
      : undefined,
  )
  @ValidateNested({ each: true })
  @Type(() => ExerciseLibrarySelectionDto)
  selections!: ExerciseLibrarySelectionDto[];
}
