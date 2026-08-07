import { NotFoundException } from '@nestjs/common';

export function createTrainingPlanNotFoundException(): NotFoundException {
  const result = new NotFoundException({
    code: 'TRAINING_PLAN_NOT_FOUND',
    details: {},
    message: 'Training plan not found.',
  });

  return result;
}

export function createWorkoutNotFoundException(): NotFoundException {
  const result = new NotFoundException({
    code: 'WORKOUT_NOT_FOUND',
    details: {},
    message: 'Workout not found.',
  });

  return result;
}
