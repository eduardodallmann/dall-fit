import { HttpException, HttpStatus } from '@nestjs/common';

function trainingException(
  status: HttpStatus,
  code: string,
  message: string,
): HttpException {
  const result = new HttpException({ code, details: {}, message }, status);
  return result;
}

export const createActiveTrainingPlanNotFoundException = () =>
  trainingException(
    HttpStatus.NOT_FOUND,
    'TRAINING_PLAN_ACTIVE_SELECTION_NOT_FOUND',
    'No active training plan was found.',
  );

export const createTrainingWorkoutNotFoundException = () =>
  trainingException(
    HttpStatus.NOT_FOUND,
    'TRAINING_WORKOUT_NOT_FOUND',
    'The workout was not found in the active plan.',
  );

export const createWorkoutSessionAlreadyActiveException = () =>
  trainingException(
    HttpStatus.CONFLICT,
    'WORKOUT_SESSION_ALREADY_ACTIVE',
    'A workout session is already active.',
  );

export const createWorkoutSessionNotFoundException = () =>
  trainingException(
    HttpStatus.NOT_FOUND,
    'WORKOUT_SESSION_NOT_FOUND',
    'The active workout session was not found.',
  );

export const createWorkoutSessionExpiredException = () =>
  trainingException(
    HttpStatus.GONE,
    'WORKOUT_SESSION_EXPIRED',
    'The active workout session expired.',
  );

export const createWorkoutSessionVersionConflictException = () =>
  trainingException(
    HttpStatus.CONFLICT,
    'WORKOUT_SESSION_VERSION_CONFLICT',
    'The workout session changed in another client.',
  );

export const createWorkoutTimezoneInvalidException = () =>
  trainingException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'The supplied timezone is invalid.',
  );

export const createWorkoutExerciseNotFoundException = () =>
  trainingException(
    HttpStatus.NOT_FOUND,
    'WORKOUT_EXERCISE_NOT_FOUND',
    'The exercise was not found in the workout session.',
  );

export const createWorkoutSeriesNotFoundException = () =>
  trainingException(
    HttpStatus.NOT_FOUND,
    'WORKOUT_SERIES_NOT_FOUND',
    'The series was not found in the exercise.',
  );

export const createWorkoutLoadInvalidException = () =>
  trainingException(
    HttpStatus.BAD_REQUEST,
    'WORKOUT_LOAD_INVALID',
    'Load must be empty or an integer between 0 and 9999.',
  );

export const createWorkoutSeriesAlreadyCompletedException = () =>
  trainingException(
    HttpStatus.CONFLICT,
    'WORKOUT_SERIES_ALREADY_COMPLETED',
    'The series is already completed or is not the current series.',
  );

export const createWorkoutTimerAlreadyActiveException = () =>
  trainingException(
    HttpStatus.CONFLICT,
    'WORKOUT_TIMER_ALREADY_ACTIVE',
    'A timer is already active.',
  );

export const createWorkoutTimerNotFoundException = () =>
  trainingException(
    HttpStatus.NOT_FOUND,
    'WORKOUT_TIMER_NOT_FOUND',
    'No active workout timer was found.',
  );

export const createWorkoutTimerOutcomeInvalidException = () =>
  trainingException(
    HttpStatus.BAD_REQUEST,
    'WORKOUT_TIMER_OUTCOME_INVALID',
    'The timer outcome is not valid for this timer.',
  );

export const createWorkoutExerciseTypeInvalidException = () =>
  trainingException(
    HttpStatus.CONFLICT,
    'WORKOUT_EXERCISE_TYPE_INVALID',
    'The operation is not valid for this exercise type.',
  );

export const createWorkoutIncompleteException = () =>
  trainingException(
    HttpStatus.CONFLICT,
    'WORKOUT_INCOMPLETE',
    'The workout still has incomplete exercises.',
  );

export const createWorkoutExecutionNotFoundException = () =>
  trainingException(
    HttpStatus.NOT_FOUND,
    'WORKOUT_EXECUTION_NOT_FOUND',
    'The workout execution was not found.',
  );

export const createWorkoutSessionTooLargeException = () =>
  trainingException(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'WORKOUT_SESSION_TOO_LARGE',
    'The workout session exceeds the supported temporary size.',
  );
