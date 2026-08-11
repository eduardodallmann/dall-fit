import {
  createPreconditionRequiredException,
  createValidationException,
} from '~/training-plan/errors/training-plan.errors';

const etagPattern = /^"training-plan:([a-f\d]{24}):(0|[1-9]\d*)"$/;

export function formatTrainingPlanEtag(
  trainingPlanId: string,
  version: number,
): string {
  const result = `"training-plan:${trainingPlanId}:${version}"`;
  return result;
}

export function parseTrainingPlanIfMatch(
  value: string | undefined,
  trainingPlanId: string,
): number {
  if (value === undefined) throw createPreconditionRequiredException();
  const match = etagPattern.exec(value);
  if (match === null || match[1] !== trainingPlanId)
    throw createValidationException();
  const result = Number(match[2]);
  return result;
}
