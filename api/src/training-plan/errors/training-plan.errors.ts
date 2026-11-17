import { HttpException, HttpStatus } from '@nestjs/common';

function domainException(
  status: HttpStatus,
  code: string,
  message: string,
): HttpException {
  const result = new HttpException({ code, details: {}, message }, status);
  return result;
}

export const createTrainingPlanNotFoundException = () =>
  domainException(
    HttpStatus.NOT_FOUND,
    'TRAINING_PLAN_NOT_FOUND',
    'Training plan not found.',
  );
export const createWorkoutNotFoundException = () =>
  domainException(
    HttpStatus.NOT_FOUND,
    'WORKOUT_NOT_FOUND',
    'Workout not found.',
  );
export const createWorkoutDuplicationUncertainException = () =>
  domainException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'WORKOUT_DUPLICATION_RESULT_UNCERTAIN',
    'Read the training plan before attempting another duplication.',
  );
export const createExerciseNotFoundException = () =>
  domainException(
    HttpStatus.NOT_FOUND,
    'EXERCISE_NOT_FOUND',
    'Exercise not found.',
  );
export const createVersionConflictException = () =>
  domainException(
    HttpStatus.PRECONDITION_FAILED,
    'TRAINING_PLAN_VERSION_CONFLICT',
    'Training plan version conflict.',
  );
export const createPreconditionRequiredException = () =>
  domainException(
    HttpStatus.PRECONDITION_REQUIRED,
    'PRECONDITION_REQUIRED',
    'X-Resource-Version is required.',
  );
export const createValidationException = () =>
  domainException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'Request validation failed.',
  );
export const createWorkoutLimitException = () =>
  domainException(
    HttpStatus.CONFLICT,
    'WORKOUT_LIMIT_REACHED',
    'Workout limit reached.',
  );
export const createExerciseLimitException = () =>
  domainException(
    HttpStatus.CONFLICT,
    'EXERCISE_LIMIT_REACHED',
    'Exercise limit reached.',
  );
export const createTrainingPlanSizeLimitException = () =>
  domainException(
    HttpStatus.CONFLICT,
    'TRAINING_PLAN_SIZE_LIMIT_REACHED',
    'Training plan size limit reached.',
  );
export const createInvalidExerciseOrderException = () =>
  domainException(
    HttpStatus.BAD_REQUEST,
    'INVALID_EXERCISE_ORDER',
    'Exercise order is invalid.',
  );
export const createInvalidExerciseTypeException = () =>
  domainException(
    HttpStatus.BAD_REQUEST,
    'INVALID_EXERCISE_TYPE',
    'Exercise type is invalid.',
  );
export const createInvalidYoutubeReferenceException = () =>
  domainException(
    HttpStatus.BAD_REQUEST,
    'INVALID_YOUTUBE_REFERENCE',
    'YouTube reference is invalid.',
  );
export const createYoutubeUnavailableException = () =>
  domainException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'YOUTUBE_VALIDATION_UNAVAILABLE',
    'YouTube validation is unavailable.',
  );
export const createImageTooLargeException = () =>
  domainException(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'IMAGE_TOO_LARGE',
    'Image is too large.',
  );
export const createUnsupportedImageTypeException = () =>
  domainException(
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    'UNSUPPORTED_IMAGE_TYPE',
    'Image type is unsupported.',
  );
export const createImageUploadFailedException = () =>
  domainException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'IMAGE_UPLOAD_FAILED',
    'Image upload failed.',
  );
export const createImageUrlSigningFailedException = () =>
  domainException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'IMAGE_URL_SIGNING_FAILED',
    'Image URL signing failed.',
  );
export const createExerciseLibraryStaleException = (staleGroupIds: string[]) =>
  new HttpException(
    {
      code: 'EXERCISE_LIBRARY_SELECTION_STALE',
      message: 'Selected exercises changed. Reload the library.',
      details: { staleGroupIds },
    },
    HttpStatus.CONFLICT,
  );
export const createExerciseImageCopyFailedException = () =>
  domainException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'EXERCISE_IMAGE_COPY_FAILED',
    'Exercise image copy failed.',
  );
export const createExerciseCopyUncertainException = () =>
  domainException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'EXERCISE_COPY_RESULT_UNCERTAIN',
    'Reload the workout before another copy.',
  );
export const createCatalogEntryNotFoundException = () =>
  domainException(
    HttpStatus.NOT_FOUND,
    'TRAINING_PLAN_CATALOG_ENTRY_NOT_FOUND',
    'Training plan catalog entry not found.',
  );
export const createGlobalReferenceDuplicateException = () =>
  domainException(
    HttpStatus.CONFLICT,
    'GLOBAL_TRAINING_PLAN_REFERENCE_DUPLICATE',
    'Global training plan reference already exists.',
  );
export const createGlobalReferenceReadOnlyException = () =>
  domainException(
    HttpStatus.FORBIDDEN,
    'GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY',
    'Global training plan reference is read-only.',
  );
export const createActiveTrainingPlanLimitException = () => {
  const result = new HttpException(
    {
      code: 'ACTIVE_TRAINING_PLAN_LIMIT_REACHED',
      details: { limit: 5 },
      message: 'Active training plan limit reached.',
    },
    HttpStatus.CONFLICT,
  );
  return result;
};
export const createCloneJobDuplicateException = () =>
  domainException(
    HttpStatus.CONFLICT,
    'TRAINING_PLAN_CLONE_JOB_DUPLICATE',
    'A clone job already exists for this training plan.',
  );
export const createCloneJobNotFoundException = () =>
  domainException(
    HttpStatus.NOT_FOUND,
    'TRAINING_PLAN_CLONE_JOB_NOT_FOUND',
    'Training plan clone job not found.',
  );
export const createCloneJobStateConflictException = () =>
  domainException(
    HttpStatus.CONFLICT,
    'TRAINING_PLAN_CLONE_JOB_STATE_CONFLICT',
    'Training plan clone job state does not allow this operation.',
  );
export const createCloneSchedulingUnavailableException = () =>
  domainException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'TRAINING_PLAN_CLONE_SCHEDULING_UNAVAILABLE',
    'Training plan clone scheduling is unavailable.',
  );
