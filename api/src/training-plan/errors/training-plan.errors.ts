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
